const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

// Student Login
exports.studentLogin = async (req, res) => {
  try {
    const { identifier, password, captchaAnswer, num1, num2, operator } = req.body;

    if (!identifier || !password) {
      return res.status(400).json({ success: false, message: 'Roll Number / Student ID and password are required.' });
    }

    // Verify Math CAPTCHA
    if (num1 !== undefined && num2 !== undefined && operator && captchaAnswer !== undefined) {
      let expected = 0;
      if (operator === '+') expected = Number(num1) + Number(num2);
      if (operator === '-') expected = Number(num1) - Number(num2);
      if (operator === '*') expected = Number(num1) * Number(num2);

      if (Number(captchaAnswer) !== expected) {
        return res.status(400).json({ success: false, message: 'Invalid mathematical verification code. Please try again.' });
      }
    }

    const cleanIdentifier = identifier.trim();
    const [rows] = await query(
      'SELECT * FROM students WHERE roll_number = ? OR student_id = ? OR email = ?',
      [cleanIdentifier, cleanIdentifier, cleanIdentifier]
    );

    if (!rows || rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Student account not found.' });
    }

    const student = rows[0];

    // Password check (bcrypt or plain date-of-birth comparison fallback DDMMYYYY)
    let isMatch = await bcrypt.compare(password.trim(), student.password);

    // Fallback DOB verification if plain dob input DDMMYYYY vs YYYY-MM-DD
    if (!isMatch && student.dob) {
      const rawDob = student.dob.toString();
      const cleanDob = rawDob.replace(/-/g, ''); // YYYYMMDD
      const formattedDob = rawDob.split('-').reverse().join(''); // DDMMYYYY
      if (password.trim() === cleanDob || password.trim() === formattedDob || password.trim() === rawDob) {
        isMatch = true;
      }
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid password credentials. Default password is Date of Birth (DDMMYYYY).' });
    }

    // Generate JWT Token
    const payload = {
      id: student.id,
      role: 'student',
      student_id: student.student_id,
      roll_number: student.roll_number,
      email: student.email,
      name: student.name
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'feedesk_super_secret_jwt_key_2026_production', {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    const { password: _, ...studentData } = student;

    res.json({
      success: true,
      message: 'Student login successful!',
      token,
      user: {
        ...studentData,
        role: 'student'
      }
    });
  } catch (error) {
    console.error('Student Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during student login.', error: error.message });
  }
};

// Admin Login
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Admin email and password are required.' });
    }

    const cleanEmail = email.trim();
    const [rows] = await query('SELECT * FROM admins WHERE email = ?', [cleanEmail]);

    if (!rows || rows.length === 0) {
      return res.status(401).json({ success: false, message: 'Admin account not found. Please check your email.' });
    }

    const admin = rows[0];
    let isMatch = await bcrypt.compare(password.trim(), admin.password);

    if (!isMatch && password.trim() === 'Hicas@123') { // Fallback for initial demo setup
      isMatch = true;
    }

    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const payload = {
      id: admin.id,
      role: admin.role || 'admin',
      email: admin.email,
      name: admin.name,
      permissions: admin.permissions || 'ALL'
    };

    const token = jwt.sign(payload, process.env.JWT_SECRET || 'feedesk_super_secret_jwt_key_2026_production', {
      expiresIn: process.env.JWT_EXPIRES_IN || '7d'
    });

    const { password: _, ...adminData } = admin;

    res.json({
      success: true,
      message: 'Admin login successful!',
      token,
      user: {
        ...adminData,
        role: admin.role || 'admin'
      }
    });
  } catch (error) {
    console.error('Admin Login Error:', error);
    res.status(500).json({ success: false, message: 'Server error during admin login.', error: error.message });
  }
};

// Get current profile
exports.getProfile = async (req, res) => {
  try {
    const { id, role } = req.user;

    if (role === 'student') {
      const [rows] = await query('SELECT * FROM students WHERE id = ?', [id]);
      if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Student profile not found.' });
      const { password, ...studentData } = rows[0];
      return res.json({ success: true, user: { ...studentData, role: 'student' } });
    } else {
      const [rows] = await query('SELECT * FROM admins WHERE id = ?', [id]);
      if (!rows || rows.length === 0) return res.status(404).json({ success: false, message: 'Admin profile not found.' });
      const { password, ...adminData } = rows[0];
      return res.json({ success: true, user: { ...adminData, role: adminData.role || 'admin' } });
    }
  } catch (error) {
    console.error('Get Profile Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve profile data.' });
  }
};
