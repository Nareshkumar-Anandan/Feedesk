const bcrypt = require('bcryptjs');
const ExcelJS = require('exceljs');
const { query } = require('../config/db');

// Helper to reliably parse DOB (DD-MM-YYYY, YYYY-MM-DD, DD/MM/YYYY, Excel serials)
function parseAndFormatDob(rawDob) {
  let formattedDob = '2005-08-15';
  let cleanPasswordDigits = '15082005';

  if (!rawDob) return { formattedDob, cleanPasswordDigits };

  // If number or numeric string (Excel serial date)
  if (typeof rawDob === 'number' || (!isNaN(rawDob) && !String(rawDob).includes('-') && !String(rawDob).includes('/'))) {
    const num = Number(rawDob);
    const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      const year = dateObj.getFullYear();
      const month = String(dateObj.getMonth() + 1).padStart(2, '0');
      const day = String(dateObj.getDate()).padStart(2, '0');
      formattedDob = `${year}-${month}-${day}`;
      cleanPasswordDigits = `${day}${month}${year}`;
      return { formattedDob, cleanPasswordDigits };
    }
  }

  const str = String(rawDob).trim();
  const parts = str.split(/[-/.]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      // YYYY-MM-DD or YYYY-DD-MM
      const year = parts[0];
      let month = parseInt(parts[1], 10);
      let day = parseInt(parts[2], 10);
      if (month > 12 && day <= 12) {
        const temp = month;
        month = day;
        day = temp;
      }
      if (month < 1 || month > 12) month = 1;
      if (day < 1 || day > 31) day = 1;
      const mStr = String(month).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      formattedDob = `${year}-${mStr}-${dStr}`;
      cleanPasswordDigits = `${dStr}${mStr}${year}`;
    } else if (parts[2].length === 4) {
      // DD-MM-YYYY or MM-DD-YYYY
      let day = parseInt(parts[0], 10);
      let month = parseInt(parts[1], 10);
      const year = parts[2];
      if (month > 12 && day <= 12) {
        const temp = month;
        month = day;
        day = temp;
      }
      if (month < 1 || month > 12) month = 1;
      if (day < 1 || day > 31) day = 1;
      const mStr = String(month).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      formattedDob = `${year}-${mStr}-${dStr}`;
      cleanPasswordDigits = `${dStr}${mStr}${year}`;
    }
  }

  return { formattedDob, cleanPasswordDigits };
}

// Get all students (Admin) with search and filters
exports.getAllStudents = async (req, res) => {
  try {
    const { search, department, academic_year, section } = req.query;
    let [students] = await query('SELECT id, student_id, roll_number, name, department, academic_year, course_name, course_name_2, section, dob, gender, blood_group, father_name, mother_name, father_occupation, mother_occupation, phone, parent_phone, email, address, photo_url, created_at FROM students ORDER BY id DESC');

    if (search) {
      const q = search.toLowerCase();
      students = students.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.roll_number.toLowerCase().includes(q) ||
        s.student_id.toLowerCase().includes(q) ||
        s.email.toLowerCase().includes(q)
      );
    }

    if (department) {
      students = students.filter(s => s.department === department);
    }

    if (academic_year) {
      students = students.filter(s => s.academic_year === academic_year);
    }

    if (section) {
      students = students.filter(s => s.section === section);
    }

    res.json({ success: true, count: students.length, data: students });
  } catch (error) {
    console.error('Get Students Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch students list.' });
  }
};

// Get single student by ID
exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await query('SELECT id, student_id, roll_number, name, department, academic_year, course_name, course_name_2, section, dob, gender, blood_group, father_name, mother_name, father_occupation, mother_occupation, phone, parent_phone, email, address, photo_url, created_at FROM students WHERE id = ?', [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch student details.' });
  }
};

// Create new student (Admin)
exports.createStudent = async (req, res) => {
  try {
    const {
      student_id, roll_number, name, department, academic_year, course_name, course_name_2,
      section, dob, gender, blood_group, father_name, mother_name,
      father_occupation, mother_occupation, phone, parent_phone, email, address
    } = req.body;

    if (!roll_number || !name || !email || !dob) {
      return res.status(400).json({ success: false, message: 'Required fields: Roll Number, Name, Email, DOB.' });
    }

    const genStudentId = student_id || `STU${Date.now()}`;
    const photo_url = req.file ? `/uploads/${req.file.filename}` : '';

    const { formattedDob, cleanPasswordDigits } = parseAndFormatDob(dob);
    const hashedPassword = await bcrypt.hash(cleanPasswordDigits, 10);

    const [result] = await query(
      `INSERT INTO students 
      (student_id, roll_number, name, department, academic_year, course_name, course_name_2, section, dob, gender, blood_group, father_name, mother_name, father_occupation, mother_occupation, phone, parent_phone, email, address, photo_url, password) 
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        genStudentId, roll_number, name, department || 'General', academic_year || '2025',
        course_name || '', course_name_2 || '', section || 'A', formattedDob, gender || 'Male', blood_group || 'O+',
        father_name || '', mother_name || '', father_occupation || '', mother_occupation || '',
        phone || '', parent_phone || '', email, address || '', photo_url, hashedPassword
      ]
    );

    const newStudentId = result.insertId || Date.now();

    // Auto-assign courses in student_courses table
    let [courses] = await query('SELECT * FROM courses');
    if (courses && courses.length > 0) {
      const matchedCourse = courses.find(c => (c.course_name || '').toLowerCase() === (course_name || '').toLowerCase()) || courses[0];
      if (matchedCourse) {
        await query(
          `INSERT INTO student_courses 
          (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
          VALUES (?, ?, ?, 0.00, 0.00, ?, 'pending', ?)`,
          [newStudentId, matchedCourse.id, matchedCourse.fee, matchedCourse.fee, matchedCourse.start_date || '2026-08-15']
        );
      }

      // Auto-assign second course if chosen and not 'None'
      const cleanCourse2 = (course_name_2 || '').trim();
      if (cleanCourse2 && cleanCourse2.toLowerCase() !== 'none' && cleanCourse2.toLowerCase() !== (course_name || '').toLowerCase()) {
        const matchedCourse2 = courses.find(c => (c.course_name || '').toLowerCase() === cleanCourse2.toLowerCase());
        if (matchedCourse2) {
          await query(
            `INSERT INTO student_courses 
            (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
            VALUES (?, ?, ?, 0.00, 0.00, ?, 'pending', ?)`,
            [newStudentId, matchedCourse2.id, matchedCourse2.fee, matchedCourse2.fee, matchedCourse2.start_date || '2026-08-15']
          );
        }
      }
    }

    res.status(201).json({
      success: true,
      message: 'Student registered and courses assigned successfully!',
      studentId: newStudentId
    });
  } catch (error) {
    console.error('Create Student Error:', error);
    res.status(500).json({ success: false, message: 'Failed to register student. Email or Roll Number may already exist.' });
  }
};

// Update student profile (Admin: Full update, Student: phone/email/address only)
exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      roll_number, name, department, course_name, course_name_2, dob,
      father_name, father_occupation, mother_name, mother_occupation,
      phone, parent_phone, email, address
    } = req.body;

    const isStudent = req.user.role === 'student';
    if (isStudent && Number(req.user.id) !== Number(id)) {
      return res.status(403).json({ success: false, message: 'Unauthorized profile modification.' });
    }

    if (isStudent) {
      await query(
        'UPDATE students SET phone = ?, email = ?, address = ? WHERE id = ?',
        [phone || '', email || '', address || '', id]
      );
    } else {
      await query(
        `UPDATE students 
         SET roll_number = ?, name = ?, department = ?, course_name = ?, course_name_2 = ?, dob = ?,
             father_name = ?, father_occupation = ?, mother_name = ?, mother_occupation = ?,
             phone = ?, parent_phone = ?, email = ?, address = ?
         WHERE id = ?`,
        [
          roll_number, name, department || '', course_name || '', course_name_2 || '', dob,
          father_name || '', father_occupation || '', mother_name || '', mother_occupation || '',
          phone || '', parent_phone || '', email || '', address || '', id
        ]
      );

      // Sync student_courses
      let [courses] = await query('SELECT * FROM courses');
      if (courses && courses.length > 0) {
        const studentDbId = Number(id);
        const [existingScs] = await query('SELECT * FROM student_courses WHERE student_id = ?', [studentDbId]);

        // 1. Ensure course 1 is assigned
        const matchedCourse1 = courses.find(c => (c.course_name || '').toLowerCase() === (course_name || '').toLowerCase()) || courses[0];
        if (matchedCourse1) {
          const hasSc1 = existingScs.find(sc => sc.course_id === matchedCourse1.id);
          if (!hasSc1) {
            if (existingScs.length > 0 && existingScs[0].payment_status !== 'paid') {
              await query('UPDATE student_courses SET course_id = ?, fee_amount = ?, final_amount = ? WHERE id = ?', [
                matchedCourse1.id, matchedCourse1.fee, matchedCourse1.fee, existingScs[0].id
              ]);
            } else {
              await query(
                `INSERT INTO student_courses 
                (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
                VALUES (?, ?, ?, 0.00, 0.00, ?, 'pending', ?)`,
                [studentDbId, matchedCourse1.id, matchedCourse1.fee, matchedCourse1.fee, matchedCourse1.start_date || '2026-08-15']
              );
            }
          }
        }

        // 2. Ensure course 2 is assigned if specified
        const cleanCourse2 = (course_name_2 || '').trim();
        if (cleanCourse2 && cleanCourse2.toLowerCase() !== 'none' && cleanCourse2.toLowerCase() !== (course_name || '').toLowerCase()) {
          const matchedCourse2 = courses.find(c => (c.course_name || '').toLowerCase() === cleanCourse2.toLowerCase());
          if (matchedCourse2) {
            const hasSc2 = existingScs.find(sc => sc.course_id === matchedCourse2.id);
            if (!hasSc2) {
              await query(
                `INSERT INTO student_courses 
                (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
                VALUES (?, ?, ?, 0.00, 0.00, ?, 'pending', ?)`,
                [studentDbId, matchedCourse2.id, matchedCourse2.fee, matchedCourse2.fee, matchedCourse2.start_date || '2026-08-15']
              );
            }
          }
        }
      }
    }

    res.json({ success: true, message: 'Student profile updated successfully!' });
  } catch (error) {
    console.error('Update Student Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update student profile.' });
  }
};

// Bulk Assign / Change Courses for Selected Students (Admin)
exports.bulkAssignCourses = async (req, res) => {
  try {
    const { ids, course_name, course_name_2 } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Please select at least one student.' });
    }
    if (!course_name) {
      return res.status(400).json({ success: false, message: 'Please select a primary course.' });
    }

    let [courses] = await query('SELECT * FROM courses');
    const matchedCourse1 = (courses || []).find(c => (c.course_name || '').toLowerCase() === (course_name || '').toLowerCase());
    const cleanCourse2 = (course_name_2 || '').trim();
    const matchedCourse2 = (cleanCourse2 && cleanCourse2.toLowerCase() !== 'none' && cleanCourse2.toLowerCase() !== (course_name || '').toLowerCase())
      ? (courses || []).find(c => (c.course_name || '').toLowerCase() === cleanCourse2.toLowerCase())
      : null;

    for (const id of ids) {
      const studentDbId = Number(id);
      // 1. Update students table course fields only
      await query(
        'UPDATE students SET course_name = ?, course_name_2 = ? WHERE id = ?',
        [course_name, cleanCourse2 && cleanCourse2.toLowerCase() !== 'none' ? cleanCourse2 : '', studentDbId]
      );

      // 2. Synchronize student_courses
      if (courses && courses.length > 0) {
        const [existingScs] = await query('SELECT * FROM student_courses WHERE student_id = ?', [studentDbId]);

        // Course 1
        if (matchedCourse1) {
          const has1 = existingScs.find(sc => sc.course_id === matchedCourse1.id);
          if (!has1) {
            if (existingScs.length > 0 && existingScs[0].payment_status !== 'paid') {
              await query('UPDATE student_courses SET course_id = ?, fee_amount = ?, final_amount = ? WHERE id = ?', [
                matchedCourse1.id, matchedCourse1.fee, matchedCourse1.fee, existingScs[0].id
              ]);
            } else {
              await query(
                `INSERT INTO student_courses 
                (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
                VALUES (?, ?, ?, 0.00, 0.00, ?, 'pending', ?)`,
                [studentDbId, matchedCourse1.id, matchedCourse1.fee, matchedCourse1.fee, matchedCourse1.start_date || '2026-08-15']
              );
            }
          }
        }

        // Course 2
        if (matchedCourse2) {
          const has2 = existingScs.find(sc => sc.course_id === matchedCourse2.id);
          if (!has2) {
            await query(
              `INSERT INTO student_courses 
              (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
              VALUES (?, ?, ?, 0.00, 0.00, ?, 'pending', ?)`,
              [studentDbId, matchedCourse2.id, matchedCourse2.fee, matchedCourse2.fee, matchedCourse2.start_date || '2026-08-15']
            );
          }
        }
      }
    }

    res.json({
      success: true,
      message: `Course(s) assigned successfully to ${ids.length} student(s)!`
    });
  } catch (error) {
    console.error('Bulk Assign Courses Error:', error);
    res.status(500).json({ success: false, message: 'Failed to assign courses to selected students.' });
  }
};

// Delete student (Admin)
exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM students WHERE id = ?', [id]);
    res.json({ success: true, message: 'Student record deleted successfully.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete student.' });
  }
};

// Bulk Delete students (Admin)
exports.bulkDeleteStudents = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'No student IDs provided.' });
    }
    for (const id of ids) {
      await query('DELETE FROM students WHERE id = ?', [id]);
    }
    res.json({ success: true, message: `${ids.length} student records deleted successfully.` });
  } catch (error) {
    console.error('Bulk delete error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete selected students.' });
  }
};

// Reset password
exports.resetPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { new_password } = req.body;

    const [rows] = await query('SELECT dob FROM students WHERE id = ?', [id]);
    if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Student not found.' });

    const passwordToUse = new_password || rows[0].dob.toString().split('-').reverse().join('');
    const hashedPassword = await bcrypt.hash(passwordToUse, 10);

    await query('UPDATE students SET password = ? WHERE id = ?', [hashedPassword, id]);
    res.json({ success: true, message: `Password reset successfully. Default password is ${passwordToUse}` });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to reset password.' });
  }
};

// Export Students to Excel
exports.exportStudentsExcel = async (req, res) => {
  try {
    const [students] = await query('SELECT student_id, roll_number, name, department, academic_year, course_name, course_name_2, section, dob, phone, email FROM students');

    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Students List');

    worksheet.columns = [
      { header: 'Student ID', key: 'student_id', width: 15 },
      { header: 'Roll Number', key: 'roll_number', width: 15 },
      { header: 'Name', key: 'name', width: 25 },
      { header: 'Department', key: 'department', width: 20 },
      { header: 'Academic Year', key: 'academic_year', width: 15 },
      { header: 'Primary Course', key: 'course_name', width: 20 },
      { header: 'Second Course (Optional)', key: 'course_name_2', width: 22 },
      { header: 'Section', key: 'section', width: 10 },
      { header: 'DOB', key: 'dob', width: 12 },
      { header: 'Phone', key: 'phone', width: 15 },
      { header: 'Email', key: 'email', width: 25 }
    ];

    students.forEach(student => worksheet.addRow({
      ...student,
      course_name_2: student.course_name_2 || '-'
    }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="students_list.xlsx"');

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Export Excel Error:', error);
    res.status(500).json({ success: false, message: 'Failed to export students list.' });
  }
};

// Bulk Import Students from Excel with Column Mappings
exports.bulkImportStudents = async (req, res) => {
  try {
    const { students } = req.body;

    if (!students || !Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ success: false, message: 'No student records provided for import.' });
    }

    let [courses] = await query('SELECT * FROM courses');
    const defaultCourse = courses && courses.length > 0 ? courses[0] : null;

    let importedCount = 0;
    let skippedCount = 0;

    for (const st of students) {
      const name = (st.name || '').trim();
      const rollNumber = (st.roll_number || '').trim();

      if (!name || !rollNumber) {
        skippedCount++;
        continue;
      }

      const { formattedDob, cleanPasswordDigits } = parseAndFormatDob(st.dob);
      const hashedPassword = await bcrypt.hash(cleanPasswordDigits, 10);
      const studentId = `STU${Date.now()}_${Math.floor(100 + Math.random() * 900)}`;
      const department = st.department || 'B.Com - Computer Applications';
      const courseName = st.course_name || (defaultCourse ? defaultCourse.course_name : 'Skill Enhancement');
      const courseName2 = (st.course_name_2 || '').trim();
      const email = st.email || `${rollNumber.toLowerCase()}@hindusthan.net`;
      const phone = st.phone || '';
      const gender = st.gender || 'Male';
      const bloodGroup = st.blood_group || 'O+';
      const fatherName = st.father_name || '';
      const fatherOccupation = st.father_occupation || '';
      const motherName = st.mother_name || '';
      const motherOccupation = st.mother_occupation || '';
      const parentPhone = st.parent_phone || '';
      const address = st.address || '';
      const academicYear = st.academic_year || '2025';
      const section = st.section || 'A';

      const [insertRes] = await query(
        `INSERT INTO students 
        (student_id, roll_number, name, department, academic_year, course_name, course_name_2, section, dob, gender, blood_group, father_name, mother_name, father_occupation, mother_occupation, phone, parent_phone, email, address, photo_url, password) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '', ?)
        ON DUPLICATE KEY UPDATE 
          name = VALUES(name),
          department = VALUES(department),
          academic_year = VALUES(academic_year),
          course_name = VALUES(course_name),
          course_name_2 = VALUES(course_name_2),
          section = VALUES(section),
          dob = VALUES(dob),
          gender = VALUES(gender),
          blood_group = VALUES(blood_group),
          father_name = VALUES(father_name),
          mother_name = VALUES(mother_name),
          father_occupation = VALUES(father_occupation),
          mother_occupation = VALUES(mother_occupation),
          phone = VALUES(phone),
          parent_phone = VALUES(parent_phone),
          address = VALUES(address)`,
        [
          studentId, rollNumber, name, department, academicYear,
          courseName, courseName2, section, formattedDob, gender, bloodGroup,
          fatherName, motherName, fatherOccupation, motherOccupation,
          phone, parentPhone, email, address, hashedPassword
        ]
      );

      let studentDbId = insertRes.insertId || insertRes.id;
      if (!studentDbId) {
        const [found] = await query('SELECT id FROM students WHERE roll_number = ?', [rollNumber]);
        if (found && found.length > 0) studentDbId = found[0].id;
      }

      if (courses && courses.length > 0 && studentDbId) {
        const assignedCourse1 = (courses || []).find(c => (c.course_name || '').toLowerCase() === courseName.toLowerCase()) || defaultCourse;
        const [existingScs] = await query('SELECT id, course_id FROM student_courses WHERE student_id = ?', [studentDbId]);
        
        if (assignedCourse1) {
          const has1 = existingScs.find(sc => sc.course_id === assignedCourse1.id);
          if (!has1) {
            if (existingScs.length === 0) {
              await query(
                `INSERT INTO student_courses 
                (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
                VALUES (?, ?, ?, 0.00, 0.00, ?, 'pending', ?)`,
                [studentDbId, assignedCourse1.id, assignedCourse1.fee, assignedCourse1.fee, assignedCourse1.start_date || '2026-08-15']
              );
            } else {
              await query(
                `UPDATE student_courses SET course_id = ?, fee_amount = ?, final_amount = ? WHERE id = ?`,
                [assignedCourse1.id, assignedCourse1.fee, assignedCourse1.fee, existingScs[0].id]
              );
            }
          }
        }

        if (courseName2 && courseName2.toLowerCase() !== 'none' && courseName2.toLowerCase() !== courseName.toLowerCase()) {
          const assignedCourse2 = (courses || []).find(c => (c.course_name || '').toLowerCase() === courseName2.toLowerCase());
          if (assignedCourse2) {
            const has2 = existingScs.find(sc => sc.course_id === assignedCourse2.id);
            if (!has2) {
              await query(
                `INSERT INTO student_courses 
                (student_id, course_id, fee_amount, discount_amount, fine_amount, final_amount, payment_status, due_date)
                VALUES (?, ?, ?, 0.00, 0.00, ?, 'pending', ?)`,
                [studentDbId, assignedCourse2.id, assignedCourse2.fee, assignedCourse2.fee, assignedCourse2.start_date || '2026-08-15']
              );
            }
          }
        }
      }

      importedCount++;
    }

    res.json({
      success: true,
      message: `Excel import successful! Imported ${importedCount} student records${skippedCount > 0 ? ` (${skippedCount} skipped due to missing required fields)` : ''}.`,
      importedCount,
      skippedCount
    });
  } catch (error) {
    console.error('Bulk Import Error:', error);
    res.status(500).json({ success: false, message: 'Failed to import student records from Excel.', error: error.message });
  }
};

