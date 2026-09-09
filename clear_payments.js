const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });

async function clearPayments() {
  console.log('\n======================================================');
  console.log('💳 FeeDesk Transaction & Payments Cleaner (clear_payments.js)');
  console.log('======================================================\n');

  let mysqlSuccess = false;

  // 1. Clear MySQL Database
  try {
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASS || 'Mysql@123',
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      database: process.env.DB_NAME || 'student_course_db'
    });

    await conn.query('SET FOREIGN_KEY_CHECKS = 0');
    await conn.query('TRUNCATE TABLE payments');
    await conn.query('TRUNCATE TABLE payment_history');
    await conn.query('TRUNCATE TABLE invoices');
    await conn.query("UPDATE student_courses SET payment_status = 'pending'");
    await conn.query('SET FOREIGN_KEY_CHECKS = 1');
    await conn.end();

    console.log('✅ [MySQL] Successfully wiped `payments`, `payment_history`, and `invoices`.');
    console.log('✅ [MySQL] Reset all `student_courses` payment statuses to pending.');
    mysqlSuccess = true;
  } catch (err) {
    console.warn('⚠️ [MySQL Notice]:', err.message);
  }

  // 2. Clear Fallback JSON Data Store
  const storePath = path.join(__dirname, 'data_store.json');
  if (fs.existsSync(storePath)) {
    try {
      const data = JSON.parse(fs.readFileSync(storePath, 'utf8'));
      data.payments = [];
      data.payment_history = [];
      data.invoices = [];
      if (data.student_courses && Array.isArray(data.student_courses)) {
        data.student_courses.forEach(sc => {
          sc.payment_status = 'pending';
        });
      }
      fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
      console.log('✅ [JSON Store] Successfully wiped payments from `data_store.json`.');
    } catch (err) {
      console.error('❌ [JSON Store Error]:', err.message);
    }
  }

  console.log('\n🎉 Transaction history cleared cleanly. All dues reset to pending.');
  console.log('======================================================\n');
  process.exit(0);
}

clearPayments();
