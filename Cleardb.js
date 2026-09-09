const { getDbConnection, query } = require('./config/db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

async function clearDatabase() {
  console.log('\n======================================================');
  console.log('🧹 FeeDesk Database Cleaner & Reset Utility (Cleardb.js)');
  console.log('======================================================\n');

  const args = process.argv.slice(2);
  const isTransactionsOnly = args.includes('--transactions') || args.includes('-t');
  const isWithSeed = args.includes('--seed') || args.includes('-s');

  const db = await getDbConnection();

  try {
    if (db.isFallback) {
      console.log('📁 Target: Fallback JSON Data Store (backend/data_store.json)');

      if (isTransactionsOnly) {
        console.log('⏳ Wiping payments, invoices, and transaction history...');
        await db.clearAllData('transactions_only');
        console.log('✅ Payments, invoices, and payment history cleared.');
        console.log('✅ Student course payment statuses reset to pending.');
      } else {
        console.log('⏳ Wiping all students, courses, student_courses, payments, and invoices...');
        await db.clearAllData('all');
        console.log('✅ All student records removed.');
        console.log('✅ All course modules removed.');
        console.log('✅ All payment logs & invoice records removed.');
        console.log('✅ Preserved primary Super Admin: developer@hindusthan.net / Hicas@123');
      }

      if (isWithSeed) {
        console.log('\n🌱 Re-seeding default demo catalog and students...');
        const adminPasswordHash = await bcrypt.hash('Hicas@123', 10);
        const defaultStudentPasswordHash = await bcrypt.hash('15082005', 10);

        db.data.admins = [{
          id: 1,
          name: 'System Super Admin',
          email: 'developer@hindusthan.net',
          password: adminPasswordHash,
          role: 'super_admin',
          permissions: 'ALL',
          created_at: new Date().toISOString()
        }];

        db.data.courses = [
          {
            id: 1,
            course_name: 'Software Developer',
            description: 'Core Full Stack Web & Software Engineering',
            trainer: 'Dr. Alan Turing',
            duration: '60 Hours',
            start_date: '2026-08-01',
            end_date: '2026-12-01',
            max_students: 60,
            fee: 4500,
            image_url: 'https://images.unsplash.com/photo-1517694712202-14dd9538aa97?w=600&auto=format&fit=crop&q=80',
            status: 'active',
            created_at: new Date().toISOString()
          },
          {
            id: 2,
            course_name: 'Artificial Intelligence & Machine Learning',
            description: 'Python, Neural Networks, PyTorch and Applied AI',
            trainer: 'Prof. Grace Hopper',
            duration: '45 Hours',
            start_date: '2026-08-10',
            end_date: '2026-10-01',
            max_students: 50,
            fee: 5500,
            image_url: 'https://images.unsplash.com/photo-1555949963-ff9fe0c870eb?w=600&auto=format&fit=crop&q=80',
            status: 'active',
            created_at: new Date().toISOString()
          }
        ];

        db.save();
        console.log('✅ Re-seeded default courses and active catalog.');
      }

    } else {
      console.log('🐬 Target: Live MySQL Database Engine');

      if (isTransactionsOnly) {
        console.log('⏳ Truncating payments, invoices, and transaction logs...');
        await query('TRUNCATE TABLE payments');
        await query('TRUNCATE TABLE payment_history');
        await query('TRUNCATE TABLE invoices');
        await query("UPDATE student_courses SET payment_status = 'pending'");
        console.log('✅ Payments and invoices truncated successfully.');
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
