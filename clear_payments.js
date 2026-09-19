const { getDbConnection, query } = require('./config/db');

async function clearPayments() {
  console.log('\n======================================================');
  console.log('💳 FeeDesk Transaction & Payments Cleaner (clear_payments.js)');
  console.log('======================================================\n');

  try {
    await getDbConnection();

    await query('SET FOREIGN_KEY_CHECKS = 0');
    await query('TRUNCATE TABLE payments');
    await query('TRUNCATE TABLE payment_history');
    await query('TRUNCATE TABLE invoices');
    await query("UPDATE student_courses SET payment_status = 'pending'");
    await query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('✅ [MySQL] Successfully wiped `payments`, `payment_history`, and `invoices`.');
    console.log('✅ [MySQL] Reset all `student_courses` payment statuses to pending.');
    console.log('\n🎉 Transaction history cleared cleanly. All dues reset to pending.');
    console.log('======================================================\n');
    process.exit(0);
  } catch (err) {
    console.error('❌ [MySQL Error]:', err.message);
    process.exit(1);
  }
}

clearPayments();
