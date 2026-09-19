const { getDbConnection, query } = require('./config/db');
const bcrypt = require('bcryptjs');

async function clearDatabase() {
  console.log('\n======================================================');
  console.log('🧹 FeeDesk Database Cleaner & Reset Utility (Cleardb.js)');
  console.log('======================================================\n');

  const args = process.argv.slice(2);
  const isTransactionsOnly = args.includes('--transactions') || args.includes('-t');
  const isWithSeed = args.includes('--seed') || args.includes('-s');

  await getDbConnection();

  try {
    console.log('🐬 Target: Live MySQL Database Engine');

    if (isTransactionsOnly) {
      console.log('⏳ Truncating payments, invoices, and transaction logs...');
      await query('SET FOREIGN_KEY_CHECKS = 0');
      await query('TRUNCATE TABLE payments');
      await query('TRUNCATE TABLE payment_history');
      await query('TRUNCATE TABLE invoices');
      await query("UPDATE student_courses SET payment_status = 'pending'");
      await query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('✅ Payments and invoices truncated successfully.');
      console.log('✅ Student course payment statuses reset to pending.');
    } else {
      console.log('⏳ Wiping entire MySQL database tables...');
      await query('SET FOREIGN_KEY_CHECKS = 0');
      await query('TRUNCATE TABLE payments');
      await query('TRUNCATE TABLE payment_history');
      await query('TRUNCATE TABLE invoices');
      await query('TRUNCATE TABLE student_courses');
      await query('TRUNCATE TABLE students');
      await query('TRUNCATE TABLE courses');
      await query('SET FOREIGN_KEY_CHECKS = 1');
      console.log('✅ All tables truncated cleanly.');

      const adminPasswordHash = await bcrypt.hash('Hicas@123', 10);
      await query(
        `INSERT INTO admins (name, email, password, role, permissions) 
         VALUES (?, ?, ?, 'super_admin', 'ALL') 
         ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password)`,
        ['System Super Admin', 'developer@hindusthan.net', adminPasswordHash]
      );
      console.log('✅ Preserved primary Super Admin account.');

      if (isWithSeed) {
        console.log('🌱 Re-seeding default courses...');
        await query(
          `INSERT INTO courses (course_name, description, trainer, duration, start_date, end_date, max_students, fee, image_url, status)
           VALUES 
           ('Full Stack Web Development with MERN & Cloud', 'Comprehensive course covering React, Node.js, Express, MongoDB, MySQL, Docker, and AWS Deployment.', 'Dr. Alan Turing', '60 Hours', '2026-08-01', '2026-10-15', 60, 4500.00, 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80', 'active'),
           ('Artificial Intelligence & Applied Machine Learning', 'Deep dive into Python, Data Science, Neural Networks, PyTorch, and NLP models.', 'Prof. Grace Hopper', '45 Hours', '2026-08-10', '2026-10-01', 50, 5500.00, 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=600&auto=format&fit=crop&q=80', 'active')`
        );
      }
    }

    console.log('\n✨ Database cleaned successfully!');
    console.log('======================================================\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Error while clearing database:', error.message);
    process.exit(1);
  }
}

clearDatabase();
