const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

dotenv.config();

let dbPool = null;

// Automatically create database and tables if missing on MySQL
async function autoInitMySQL(host, user, password, port, database) {
  try {
    const conn = await mysql.createConnection({ host, user, password, port });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${database}\` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;`);
    await conn.query(`USE \`${database}\`;`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('super_admin', 'admin', 'fee_counter', 'staff') DEFAULT 'admin',
        permissions VARCHAR(255) DEFAULT 'ALL',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        department_name VARCHAR(150) NOT NULL UNIQUE,
        department_code VARCHAR(50) DEFAULT '',
        description TEXT NULL,
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        course_name VARCHAR(150) NOT NULL,
        description TEXT NULL,
        trainer VARCHAR(100) NOT NULL,
        duration VARCHAR(50) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE NOT NULL,
        max_students INT DEFAULT 60,
        fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
        image_url VARCHAR(255) DEFAULT '',
        status ENUM('active', 'inactive') DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS students (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id VARCHAR(50) NOT NULL UNIQUE,
        roll_number VARCHAR(50) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        department VARCHAR(100) NOT NULL,
        academic_year VARCHAR(20) NOT NULL,
        course_name VARCHAR(100) NOT NULL,
        course_name_2 VARCHAR(100) DEFAULT '',
        section VARCHAR(10) NOT NULL,
        dob DATE NOT NULL,
        gender ENUM('Male', 'Female', 'Other') DEFAULT 'Male',
        blood_group VARCHAR(10) DEFAULT 'O+',
        father_name VARCHAR(100) DEFAULT '',
        mother_name VARCHAR(100) DEFAULT '',
        father_occupation VARCHAR(100) DEFAULT '',
        mother_occupation VARCHAR(100) DEFAULT '',
        phone VARCHAR(20) DEFAULT '',
        parent_phone VARCHAR(20) DEFAULT '',
        email VARCHAR(150) NOT NULL UNIQUE,
        address TEXT NULL,
        photo_url VARCHAR(255) DEFAULT '',
        password VARCHAR(255) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    try {
      await conn.query(`ALTER TABLE students ADD COLUMN course_name_2 VARCHAR(100) DEFAULT '' AFTER course_name`);
    } catch (e) {
      // Column may already exist
    }

    await conn.query(`
      CREATE TABLE IF NOT EXISTS student_courses (
        id INT AUTO_INCREMENT PRIMARY KEY,
        student_id INT NOT NULL,
        course_id INT NOT NULL,
        assigned_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        fee_amount DECIMAL(10, 2) NOT NULL,
        discount_amount DECIMAL(10, 2) DEFAULT 0.00,
        fine_amount DECIMAL(10, 2) DEFAULT 0.00,
        final_amount DECIMAL(10, 2) NOT NULL,
        payment_status ENUM('pending', 'paid', 'partially_paid') DEFAULT 'pending',
        due_date DATE DEFAULT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS payments (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) NOT NULL UNIQUE,
        student_id INT NOT NULL,
        course_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        gst_amount DECIMAL(10, 2) DEFAULT 0.00,
        total_amount DECIMAL(10, 2) NOT NULL,
        payment_mode VARCHAR(50) NOT NULL,
        transaction_id VARCHAR(100) DEFAULT '',
        razorpay_order_id VARCHAR(100) DEFAULT '',
        razorpay_payment_id VARCHAR(100) DEFAULT '',
        payment_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        status ENUM('success', 'pending', 'failed', 'approved') DEFAULT 'success',
        remarks TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS payment_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        payment_id INT NOT NULL,
        status VARCHAR(50) NOT NULL,
        notes TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS invoices (
        id INT AUTO_INCREMENT PRIMARY KEY,
        invoice_number VARCHAR(50) NOT NULL UNIQUE,
        student_id INT NOT NULL,
        course_id INT NOT NULL,
        payment_id INT NOT NULL,
        amount DECIMAL(10, 2) NOT NULL,
        gst_amount DECIMAL(10, 2) DEFAULT 0.00,
        total_amount DECIMAL(10, 2) NOT NULL,
        pdf_path VARCHAR(255) DEFAULT '',
        generated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (student_id) REFERENCES students(id) ON DELETE CASCADE,
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
        FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS settings (
        id INT AUTO_INCREMENT PRIMARY KEY,
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_type ENUM('student', 'admin', 'all') DEFAULT 'student',
        user_id INT DEFAULT NULL,
        title VARCHAR(150) NOT NULL,
        message TEXT NOT NULL,
        is_read TINYINT(1) DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Ensure Default Super Admin exists
    const adminHash = await bcrypt.hash('Hicas@123', 10);
    await conn.query(`
      INSERT INTO admins (name, email, password, role, permissions)
      VALUES ('System Super Admin', 'developer@hindusthan.net', ?, 'super_admin', 'ALL')
      ON DUPLICATE KEY UPDATE name = VALUES(name)
    `, [adminHash]);

    // Ensure default settings exist
    const defaultSettings = [
      ['institution_name', 'Hindusthan Institute of Advanced Study'],
      ['institution_address', 'Avinashi Rd, behind Nava India, Udayampalayam, Tamil Nadu 641028'],
      ['institution_phone', '+91 98431 33333'],
      ['institution_email', 'info@hindusthan.net'],
      ['institution_website', 'https://www.hicas.ac.in'],
      ['razorpay_key_id', 'rzp_test_mockkey12345'],
      ['academic_year', '2025-2026'],
      ['pos_enabled', 'true'],
      ['pos_machine_model', 'PAX A920 Axis Bank BonusHub'],
      ['pos_ip_address', '192.168.0.102'],
      ['pos_port', '8080'],
      ['pos_terminal_id', '15962442']
    ];

    for (const [key, val] of defaultSettings) {
      await conn.query(`
        INSERT INTO settings (setting_key, setting_value)
        VALUES (?, ?)
        ON DUPLICATE KEY UPDATE setting_key = setting_key
      `, [key, val]);
    }

    await conn.end();
    console.log('✅ [MySQL Init] Database schema and tables verified & ready.');
  } catch (err) {
    console.warn('[MySQL Init Notice]:', err.message);
  }
}

async function getDbConnection() {
  if (dbPool) return dbPool;

  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASS || '';
  const database = process.env.DB_NAME || 'student_course_db';
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  // Initialize DB & Tables
  await autoInitMySQL(host, user, password, port, database);

  const pool = mysql.createPool({
    host,
    user,
    password,
    database,
    port,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  // Verify connection
  const connection = await pool.getConnection();
  connection.release();
  console.log(`✅ Connected to MySQL Database [${database}] on ${host}:${port}`);

  dbPool = pool;
  return dbPool;
}

// Wrapper query execution function
async function query(sql, params) {
  const pool = await getDbConnection();
  return await pool.query(sql, params);
}

module.exports = {
  getDbConnection,
  query
};
