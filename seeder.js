const { getDbConnection, query } = require('./config/db');
const bcrypt = require('bcryptjs');

const COURSE_LIST = [
  'B.Com - Commerce',
  'B.Com - Computer Applications',
  'B.Com - Information Technology',
  'B.Com - Corporate Secretaryship',
  'B.Com - Professional Accounting',
  'B.Com - Accounting & Finance',
  'B.Com - Banking & Insurance',
  'B.Com - International Business',
  'B.Com - Fintech with Artificial Intelligence',
  'B.C.A - Computer Applications',
  'B.B.A - Business Administration',
  'B.B.A - Computer Applications',
  'B.B.A - Logistics',
  'B.B.A - Business Analytics',
  'B.Voc - Graphic Design',
  'B.A - English',
  'B.Sc - Computer Science',
  'B.Sc - Information Technology',
  'B.Sc - Computer Technology',
  'B.Sc - Computer Science with Cognitive Systems',
  'B.Sc - Artificial Intelligence & Machine Learning',
  'B.Sc - Data Science & Analytics',
  'B.Sc - Computer Technology with Artificial Intelligence and Machine Learning',
  'B.Sc - Computer Science with Cyber Security',
  'B.Sc - Electronics & Communication Systems',
  'B.Sc - Biotechnology',
  'B.Sc - Microbiology',
  'B.Sc - Food Processing Technology & Management',
  'B.Sc - Animation & Visual Effects',
  'B.Sc - Visual Communication',
  'B.Sc - Catering Science & Hotel Management',
  'B.Sc - Costume Design & Fashion',
  'B.Sc - Psychology',
  'M.Sc - Biotechnology',
  'M.Sc - Microbiology',
  'M.Sc - Computer Science',
  'M.Sc - Information Technology',
  'M.Sc - Electronics & Communication Systems',
  'M.Sc - Physics',
  'M.Sc - Costume Design & Fashion',
  'M.Sc - Mathematics',
  'M.Sc - Visual Communication',
  'M.Sc - Applied Psychology',
  'M.A - English',
  'M.S.W - Master of Social Work',
  'M.Com - Computer Applications',
  'M.Com - International Business',
  'M.B.A - Master of Business Administration',
  'M.C.A - Master of Computer Applications'
];

async function seedDatabase() {
  console.log('🌱 Starting database seeding process...');
  await getDbConnection();

  try {
    const adminPasswordHash = await bcrypt.hash('Hicas@123', 10);
    const defaultStudentPasswordHash = await bcrypt.hash('15082005', 10);

    // 1. Seed Super Admin
    await query(
      `INSERT INTO admins (name, email, password, role, permissions) 
       VALUES (?, ?, ?, 'super_admin', 'ALL') 
       ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password)`,
      ['System Super Admin', 'developer@hindusthan.net', adminPasswordHash]
    );
    console.log('✅ Super Admin seeded.');

    // 2. Seed All 49 Departments
    console.log(`⏳ Seeding ${COURSE_LIST.length} Departments...`);
    for (const name of COURSE_LIST) {
      const parts = name.split(' - ');
      const code = parts[0] || name;
      await query(
        `INSERT INTO departments (department_name, department_code, description, status)
         VALUES (?, ?, ?, 'active')
         ON DUPLICATE KEY UPDATE department_code = VALUES(department_code), status = 'active'`,
        [name, code, `Department of ${name}`]
      );
    }
    console.log(`✅ ${COURSE_LIST.length} Departments seeded.`);

    // 3. Seed All 49 Courses
    console.log(`⏳ Seeding ${COURSE_LIST.length} Courses...`);
    for (const name of COURSE_LIST) {
      const isPG = name.startsWith('M.') || name.startsWith('M.Sc') || name.startsWith('M.Com') || name.startsWith('M.B.A') || name.startsWith('M.C.A') || name.startsWith('M.S.W') || name.startsWith('M.A');
      const duration = isPG ? '2 Years' : '3 Years';
      await query(
        `INSERT INTO courses (course_name, description, trainer, duration, start_date, end_date, max_students, fee, image_url, status)
         VALUES (?, ?, 'HICAS Faculty', ?, '2026-08-01', '2026-12-31', 60, 4500.00, '', 'active')
         ON DUPLICATE KEY UPDATE course_name = VALUES(course_name), status = 'active'`,
        [name, `Academic & Skill Development Course for ${name}`, duration]
      );
    }
    console.log(`✅ ${COURSE_LIST.length} Courses seeded.`);

    // 4. Seed Demo Students
    await query(
      `INSERT INTO students (student_id, roll_number, name, department, academic_year, course_name, section, dob, gender, blood_group, father_name, mother_name, phone, parent_phone, email, address, password)
       VALUES 
       ('STU2026001', '22IT101', 'Kavya Sri', 'B.Sc - Information Technology', '3rd Year', 'B.Sc - Information Technology', 'A', '2005-08-15', 'Female', 'O+', 'Robert Doe', 'Mary Doe', '9876543210', '9876500000', 'kavyasri@student.edu', 'Avinashi Road, Coimbatore', ?),
       ('STU2026002', '24BOO01', 'John Doe', 'B.B.A - Logistics', '1st Year', 'B.B.A - Logistics', 'A', '2006-12-10', 'Male', 'A+', 'David Doe', 'Sarah Doe', '9876543211', '9876500001', 'johndoe@student.edu', 'Nava India, Coimbatore', ?)
       ON DUPLICATE KEY UPDATE name = VALUES(name)`,
      [defaultStudentPasswordHash, defaultStudentPasswordHash]
    );
    console.log('✅ Demo students seeded.');

    console.log('\n🎉 Complete database seeding finished successfully!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    process.exit(1);
  }
}

seedDatabase();
