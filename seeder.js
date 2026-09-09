const { getDbConnection, query } = require('./config/db');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  console.log('🌱 Starting database seeding process...');
  const db = await getDbConnection();

  if (db.isFallback) {
    console.log('✅ Fallback database store initialized and pre-seeded automatically.');
    process.exit(0);
  }

  try {
    const adminPasswordHash = await bcrypt.hash('Hicas@123', 10);
    const defaultStudentPasswordHash = await bcrypt.hash('15082005', 10);

    // Seed Super Admin
    await query(
      `INSERT INTO admins (name, email, password, role, permissions) 
       VALUES (?, ?, ?, 'super_admin', 'ALL') 
       ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password)`,
      ['System Super Admin', 'developer@hindusthan.net', adminPasswordHash]
    );

    // Seed Students
    await query(
      `INSERT INTO students (student_id, roll_number, name, department, academic_year, course_name, section, dob, gender, blood_group, father_name, mother_name, phone, parent_phone, email, address, password)
       VALUES 
       ('STU2026001', '22IT101', 'John Doe', 'Information Technology', '3rd Year', 'B.Tech IT', 'A', '2005-08-15', 'Male', 'O+', 'Robert Doe', 'Mary Doe', '9876543210', '9876500000', 'johndoe@student.edu', '42 Academic Avenue, Tech City, India', ?),
       ('STU2026002', '22CS102', 'Alice Smith', 'Computer Science', '3rd Year', 'B.Tech CSE', 'B', '2004-12-10', 'Female', 'A+', 'David Smith', 'Sarah Smith', '9876543211', '9876500001', 'alicesmith@student.edu', '15 Green Campus Road, Tech City, India', ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [defaultStudentPasswordHash, defaultStudentPasswordHash]
    );

    // Seed Courses
    await query(
      `INSERT INTO courses (course_name, description, trainer, duration, start_date, end_date, max_students, fee, image_url, status)
       VALUES 
       ('Full Stack Web Development with MERN & Cloud', 'Comprehensive course covering React, Node.js, Express, MongoDB, MySQL, Docker, and AWS Deployment.', 'Dr. Alan Turing', '60 Hours', '2026-08-01', '2026-10-15', 60, 4500.00, 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80', 'active'),
       ('Artificial Intelligence & Applied Machine Learning', 'Deep dive into Python, Data Science, Neural Networks, PyTorch, and NLP models.', 'Prof. Grace Hopper', '45 Hours', '2026-08-10', '2026-10-01', 50, 5500.00, 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=600&auto=format&fit=crop&q=80', 'active'),
       ('Cybersecurity Fundamentals & Ethical Hacking', 'Hands-on training in network defense, penetration testing, cryptography, and vulnerability audit.', 'Mr. Linus Torvalds', '40 Hours', '2026-09-01', '2026-10-30', 40, 3800.00, 'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?w=600&auto=format&fit=crop&q=80', 'active')
       ON DUPLICATE KEY UPDATE course_name = VALUES(course_name)`
    );

    console.log('✅ Database seeding finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
}

seedDatabase();
