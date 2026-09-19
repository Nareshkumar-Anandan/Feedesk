const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

// Get all system settings
exports.getSettings = async (req, res) => {
  try {
    const [rows] = await query('SELECT * FROM settings');
    const settingsMap = {};
    if (rows && rows.length) {
      rows.forEach(item => {
        settingsMap[item.setting_key] = item.setting_value;
      });
    }
    res.json({ success: true, data: settingsMap });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to retrieve system settings.' });
  }
};

// Update system settings (Admin)
exports.updateSettings = async (req, res) => {
  try {
    const settingsObj = req.body;
    for (const [key, value] of Object.entries(settingsObj)) {
      await query(
        'INSERT INTO settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = ?',
        [key, String(value), String(value)]
      );
    }
    res.json({ success: true, message: 'System settings updated successfully.' });
  } catch (error) {
    console.error('Update Settings Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update settings.' });
  }
};

// Admin User Management (Super Admin)
exports.getAllAdmins = async (req, res) => {
  try {
    const [admins] = await query('SELECT id, name, email, role, permissions, created_at FROM admins');
    res.json({ success: true, data: admins });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to fetch admin accounts.' });
  }
};

exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password, role, permissions } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, Email, and Password are required.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await query(
      'INSERT INTO admins (name, email, password, role, permissions) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, role || 'admin', permissions || 'READ_WRITE']
    );

    res.status(201).json({ success: true, message: 'Admin account created successfully.', adminId: result.insertId });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to create admin account. Email may already exist.' });
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    if (Number(id) === 1) return res.status(400).json({ success: false, message: 'Cannot delete primary super admin account.' });
    await query('DELETE FROM admins WHERE id = ?', [id]);
    res.json({ success: true, message: 'Admin account removed.' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to delete admin.' });
  }
};

// Clear / Wipe Database (Super Admin)
exports.clearDatabase = async (req, res) => {
  try {
    const { type = 'all' } = req.body;
    const { getDbConnection } = require('../config/db');
    const db = await getDbConnection();

    if (type === 'transactions_only') {
      await query('TRUNCATE TABLE payments');
      await query('TRUNCATE TABLE payment_history');
      await query('TRUNCATE TABLE invoices');
      await query("UPDATE student_courses SET payment_status = 'pending'");
    } else {
      await query('SET FOREIGN_KEY_CHECKS = 0');
      await query('TRUNCATE TABLE payments');
      await query('TRUNCATE TABLE payment_history');
      await query('TRUNCATE TABLE invoices');
      await query('TRUNCATE TABLE student_courses');
      await query('TRUNCATE TABLE students');
      await query('TRUNCATE TABLE courses');
      await query('SET FOREIGN_KEY_CHECKS = 1');
    }

    res.json({
      success: true,
      message: type === 'transactions_only'
        ? 'All transactions, payments, and invoices have been cleared successfully.'
        : 'Entire database (students, courses, payments, invoices) has been wiped clean.'
    });
  } catch (error) {
    console.error('Clear Database Error:', error);
    res.status(500).json({ success: false, message: 'Failed to clear database.', error: error.message });
  }
};

// ==========================================
// FEE COUNTER OPERATORS MANAGEMENT
// ==========================================

exports.getFeeCounters = async (req, res) => {
  try {
    const [rows] = await query('SELECT id, name, email, role, permissions, counter_location, created_at FROM admins WHERE role = ?', ['fee_counter']);
    res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Get Fee Counters Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve fee counter operators.' });
  }
};

exports.createFeeCounter = async (req, res) => {
  try {
    const { name, email, password, counter_location } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Counter Name, Login Email/ID, and Password are required.' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await query(
      'INSERT INTO admins (name, email, password, role, permissions) VALUES (?, ?, ?, ?, ?)',
      [name, email, hashedPassword, 'fee_counter', counter_location || 'Main Fees Counter']
    );

    res.status(201).json({
      success: true,
      message: `Fee Counter account (${email}) created successfully!`,
      counterId: result.insertId
    });
  } catch (error) {
    console.error('Create Fee Counter Error:', error);
    res.status(500).json({ success: false, message: 'Failed to create fee counter account. Email/ID may already exist.' });
  }
};

exports.updateFeeCounter = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, password, counter_location } = req.body;

    if (password && password.trim()) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await query(
        'UPDATE admins SET name = ?, email = ?, password = ?, role = "fee_counter", permissions = ? WHERE id = ?',
        [name, email, hashedPassword, counter_location || 'Fees Counter', Number(id)]
      );
    } else {
      await query(
        'UPDATE admins SET name = ?, email = ?, role = "fee_counter", permissions = ? WHERE id = ?',
        [name, email, counter_location || 'Fees Counter', Number(id)]
      );
    }

    res.json({ success: true, message: 'Fee Counter account updated successfully!' });
  } catch (error) {
    console.error('Update Fee Counter Error:', error);
    res.status(500).json({ success: false, message: 'Failed to update fee counter account.' });
  }
};

exports.deleteFeeCounter = async (req, res) => {
  try {
    const { id } = req.params;
    await query('DELETE FROM admins WHERE id = ?', [Number(id)]);
    res.json({ success: true, message: 'Fee Counter operator account removed successfully.' });
  } catch (error) {
    console.error('Delete Fee Counter Error:', error);
    res.status(500).json({ success: false, message: 'Failed to remove fee counter account.' });
  }
};


