const { query } = require('../config/db');

// Get all courses
exports.getAllCourses = async (req, res) => {
  try {
    const { status } = req.query;
    let sql = 'SELECT * FROM courses ORDER BY id DESC';
    const [courses] = await query(sql);

    let filtered = courses;
    if (status) {
      filtered = courses.filter(c => c.status === status);
    }

    res.json({ success: true, count: filtered.length, data: filtered });
  } catch (error) {
    console.error('Get Courses Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch courses.' });
  }
};

// Get single course by ID
exports.getCourseById = async (req, res) => {
  try {
    const { id } = req.params;
    const [courses] = await query('SELECT * FROM courses WHERE id = ?', [id]);
    if (!courses || courses.length === 0) return res.status(404).json({ success: false, message: 'Course not found.' });
    res.json({ success: true, data: courses[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch course details.' });
  }
};

// Create Course (Admin)
exports.createCourse = async (req, res) => {
  try {
    const { course_name, description, trainer, duration, start_date, end_date, max_students, fee, status } = req.body;
    const image_url = req.file ? `/uploads/${req.file.filename}` : (req.body.image_url || 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80');

    if (!course_name || !fee) {
      return res.status(400).json({ success: false, message: 'Course name and fee are required.' });
    }

    const startDateVal = start_date || new Date().toISOString().split('T')[0];
    const endDateVal = end_date || '2026-12-31';

    const [result] = await query(
      `INSERT INTO courses (course_name, description, trainer, duration, start_date, end_date, max_students, fee, image_url, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [course_name, description || '', trainer || '', duration || '', startDateVal, endDateVal, Number(max_students) || 60, Number(fee), image_url, status || 'active']
    );

    res.status(201).json({ success: true, message: 'Course created successfully!', courseId: result.insertId });
  } catch (error) {
    console.error('Create Course Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create course.' });
  }
};

// Update Course (Admin)
exports.updateCourse = async (req, res) => {
  try {
    const { id } = req.params;
    const { course_name, description, trainer, duration, start_date, end_date, max_students, fee, status } = req.body;

    const image_url = req.file ? `/uploads/${req.file.filename}` : req.body.image_url;

    await query(
      `UPDATE courses SET course_name = ?, description = ?, trainer = ?, duration = ?, start_date = ?, end_date = ?, max_students = ?, fee = ?, status = ? WHERE id = ?`,
      [
        course_name,
        description || '',
        trainer || '',
        duration || '',
        start_date || '2026-08-01',
        end_date || '2026-12-31',
        Number(max_students) || 60,
        Number(fee) || 0,
        status || 'active',
        Number(id)
      ]
    );

    res.json({ success: true, message: 'Course updated successfully.' });
  } catch (error) {
    console.error('Update Course Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update course.', error: error.message });
  }
};

// Delete Course (Admin)
exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM courses WHERE id = ?', [id]);
    res.json({ success: true, message: 'Course deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete course.' });
  }
};

// Toggle Course Status (Activate / Deactivate)
exports.toggleCourseStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    await query('UPDATE courses SET status = ? WHERE id = ?', [status, id]);
    res.json({ success: true, message: `Course ${status === 'active' ? 'activated' : 'deactivated'} successfully.` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
};

// Assign Course to Students (Individual, Multiple, Dept, Year, Section)
exports.assignCourse = async (req, res) => {
  try {
    const { course_id, assignment_type, student_ids, department, academic_year, section, discount_amount, due_date } = req.body;

    const [courseRows] = await query('SELECT * FROM courses WHERE id = ?', [course_id]);
    if (!courseRows || courseRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Selected course not found.' });
    }

    const course = courseRows[0];
    let targetStudents = [];

    if (assignment_type === 'individual' || assignment_type === 'multiple') {
      if (!student_ids || student_ids.length === 0) {
        return res.status(400).json({ success: false, message: 'Please select at least one student.' });
      }
      targetStudents = student_ids;
    } else {
      let [students] = await query('SELECT id, department, academic_year, section FROM students');
      if (assignment_type === 'department' && department) {
        students = students.filter(s => s.department === department);
      }
      if (assignment_type === 'year' && academic_year) {
        students = students.filter(s => s.academic_year === academic_year);
      }
      if (assignment_type === 'section' && section) {
        students = students.filter(s => s.section === section);
      }
      targetStudents = students.map(s => s.id);
    }

    if (targetStudents.length === 0) {
      return res.status(400).json({ success: false, message: 'No matching students found for course assignment.' });
    }

    let assignedCount = 0;
    const discount = Number(discount_amount) || 0;
    const finalAmount = Math.max(0, course.fee - discount);

    for (const studentId of targetStudents) {
      // Check if already assigned
      const [existing] = await query(
        'SELECT id FROM student_courses WHERE student_id = ? AND course_id = ?',
        [studentId, course_id]
      );

      if (!existing || existing.length === 0) {
        await query(
          `INSERT INTO student_courses 
          (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
          VALUES (?, ?, ?, ?, 0.00, ?, 'pending', ?)`,
          [studentId, course_id, course.fee, discount, finalAmount, due_date || course.start_date]
        );
        assignedCount++;
      }
    }

    res.json({
      success: true,
      message: `Course '${course.course_name}' successfully assigned to ${assignedCount} student(s)!`
    });
  } catch (error) {
    console.error('Assign Course Error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign course.' });
  }
};

// Get Assigned Courses for Student or Admin view
exports.getAssignedCourses = async (req, res) => {
  try {
    const isStudent = req.user.role === 'student';
    const studentId = isStudent ? req.user.id : req.query.student_id;

    let sql = 'SELECT sc.*, c.course_name, c.trainer, c.duration, c.start_date, c.end_date, c.fee, c.image_url, c.description, s.name as student_name, s.roll_number, s.department FROM student_courses sc JOIN courses c ON sc.course_id = c.id JOIN students s ON sc.student_id = s.id';
    
    if (studentId) {
      sql += ` WHERE sc.student_id = ${Number(studentId)}`;
    }

    let [rows] = await query(sql, [studentId]);

    // Fallback: If student has no assigned course entry in student_courses, auto-assign matching or available course
    if (isStudent && rows.length === 0 && studentId) {
      const [stRows] = await query('SELECT * FROM students WHERE id = ?', [Number(studentId)]);
      const [allCourses] = await query('SELECT * FROM courses');

      if (stRows && stRows.length > 0 && allCourses && allCourses.length > 0) {
        const student = stRows[0];
        const matchedCourse = allCourses.find(c => (c.course_name || '').toLowerCase() === (student.course_name || '').toLowerCase()) || allCourses[0];

        if (matchedCourse) {
          await query(
            `INSERT INTO student_courses 
            (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
            VALUES (?, ?, ?, 0.00, 0.00, ?, 'pending', ?)`,
            [Number(studentId), matchedCourse.id, matchedCourse.fee, matchedCourse.fee, matchedCourse.start_date || '2026-08-15']
          );
          [rows] = await query(sql, [studentId]);
        }
      }
    }

    res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    console.error('Get Assigned Courses Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch assigned courses.' });
  }
};
