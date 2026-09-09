const { query } = require('../config/db');

// Get all departments (with enrolled student counts)
exports.getAllDepartments = async (req, res) => {
  try {
    const { search, status } = req.query;
    let [departments] = await query('SELECT * FROM departments ORDER BY id DESC');
    let [students] = await query('SELECT id, department FROM students');

    if (search) {
      const q = search.toLowerCase();
      departments = departments.filter(d =>
        (d.department_name || '').toLowerCase().includes(q) ||
        (d.department_code || '').toLowerCase().includes(q) ||
        (d.description || '').toLowerCase().includes(q)
      );
    }

    if (status) {
      departments = departments.filter(d => d.status === status);
    }

    // Attach student_count for each department
    const departmentsWithCounts = departments.map(dept => {
      const count = (students || []).filter(s =>
        (s.department || '').toLowerCase() === (dept.department_name || '').toLowerCase() ||
        (s.department || '').toLowerCase() === (dept.department_code || '').toLowerCase()
      ).length;
      return {
        ...dept,
        student_count: count
      };
    });

    res.json({
      success: true,
      count: departmentsWithCounts.length,
      data: departmentsWithCounts
    });
  } catch (error) {
    console.error('Get Departments Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch departments.' });
  }
};

// Get single department by ID
exports.getDepartmentById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await query('SELECT * FROM departments WHERE id = ?', [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    let [students] = await query('SELECT id, department FROM students');
    const dept = rows[0];
    const studentCount = (students || []).filter(s =>
      (s.department || '').toLowerCase() === (dept.department_name || '').toLowerCase()
    ).length;

    res.json({
      success: true,
      data: {
        ...dept,
        student_count: studentCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch department details.' });
  }
};

// Create new department
exports.createDepartment = async (req, res) => {
  try {
    const { department_name, department_code, description, status } = req.body;

    if (!department_name || !department_name.trim()) {
      return res.status(400).json({ success: false, message: 'Department name is required.' });
    }

    // Check for duplicate department name
    const [existing] = await query('SELECT * FROM departments WHERE department_name = ?', [department_name.trim()]);
    if (existing && existing.length > 0) {
      return res.status(400).json({ success: false, message: 'A department with this name already exists.' });
    }

    const code = (department_code || department_name.substring(0, 4)).toUpperCase().trim();
    const deptStatus = status || 'active';

    const [result] = await query(
      'INSERT INTO departments (department_name, department_code, description, status) VALUES (?, ?, ?, ?)',
      [department_name.trim(), code, description || '', deptStatus]
    );

    const newId = result.insertId || Date.now();

    res.status(201).json({
      success: true,
      message: 'Department added successfully!',
      data: {
        id: newId,
        department_name: department_name.trim(),
        department_code: code,
        description: description || '',
        status: deptStatus
      }
    });
  } catch (error) {
    console.error('Create Department Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create department.' });
  }
};

// Update department
exports.updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { department_name, department_code, description, status } = req.body;

    if (!department_name || !department_name.trim()) {
      return res.status(400).json({ success: false, message: 'Department name is required.' });
    }

    const [existing] = await query('SELECT * FROM departments WHERE id = ?', [id]);
    if (!existing || existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    const code = (department_code || department_name.substring(0, 4)).toUpperCase().trim();
    const deptStatus = status || existing[0].status || 'active';

    await query(
      'UPDATE departments SET department_name = ?, department_code = ?, description = ?, status = ? WHERE id = ?',
      [department_name.trim(), code, description !== undefined ? description : existing[0].description, deptStatus, id]
    );

    res.json({
      success: true,
      message: 'Department updated successfully!',
      data: {
        id: Number(id),
        department_name: department_name.trim(),
        department_code: code,
        description: description || '',
        status: deptStatus
      }
    });
  } catch (error) {
    console.error('Update Department Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update department.' });
  }
};

// Toggle status (Active / Inactive)
exports.toggleDepartmentStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await query('SELECT * FROM departments WHERE id = ?', [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    const nextStatus = rows[0].status === 'active' ? 'inactive' : 'active';
    await query('UPDATE departments SET status = ? WHERE id = ?', [nextStatus, id]);

    res.json({
      success: true,
      message: `Department marked as ${nextStatus}.`,
      status: nextStatus
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to toggle department status.' });
  }
};

// Delete department
exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await query('SELECT * FROM departments WHERE id = ?', [id]);

    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Department not found.' });
    }

    // Check if students are currently enrolled in this department
    let [students] = await query('SELECT id FROM students WHERE department = ?', [rows[0].department_name]);
    if (students && students.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete '${rows[0].department_name}'. ${students.length} student(s) are currently enrolled in this department. Please reassign them first.`
      });
    }

    await query('DELETE FROM departments WHERE id = ?', [id]);

    res.json({ success: true, message: 'Department deleted successfully.' });
  } catch (error) {
    console.error('Delete Department Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete department.' });
  }
};
