const fs = require('fs');
const path = require('path');
const { getDbConnection, query } = require('./config/db');

// Helper to format date to YYYY-MM-DD
function toDateOnly(d) {
  if (!d) return null;
  if (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    return d.split('T')[0].split(' ')[0];
  }
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// Helper to format datetime to YYYY-MM-DD HH:mm:ss
function toDateTime(d) {
  if (!d) return null;
  const date = new Date(d);
  if (isNaN(date.getTime())) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

async function migrate() {
  console.log('\n=============================================================');
  console.log('📦 FeeDesk JSON to MySQL Data Migration Tool (migrate_json_to_db.js)');
  console.log('=============================================================\n');

  // Allow custom file argument e.g. node migrate_json_to_db.js data_store.json.backup-2026-09-19
  const customFile = process.argv[2] || 'data_store.json';
  const filePath = path.isAbsolute(customFile) ? customFile : path.join(__dirname, customFile);

  if (!fs.existsSync(filePath)) {
    console.error(`❌ Error: JSON file not found at path: ${filePath}`);
    console.log(`\nUsage: node migrate_json_to_db.js [filename.json]`);
    process.exit(1);
  }

  console.log(`📖 Reading JSON file: ${filePath}`);
  let rawData;
  try {
    rawData = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (err) {
    console.error(`❌ Failed to parse JSON:`, err.message);
    process.exit(1);
  }

  await getDbConnection();

  try {
    // Disable Foreign Key checks for batch import
    await query('SET FOREIGN_KEY_CHECKS = 0');
    console.log('🔓 Temporarily disabled FOREIGN_KEY_CHECKS for seamless migration.\n');

    // 1. Migrate Admins
    if (Array.isArray(rawData.admins) && rawData.admins.length > 0) {
      console.log(`⏳ Migrating ${rawData.admins.length} Admins...`);
      for (const adm of rawData.admins) {
        await query(
          `INSERT INTO admins (id, name, email, password, role, permissions, created_at)
           VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))
           ON DUPLICATE KEY UPDATE name = VALUES(name), password = VALUES(password), role = VALUES(role), permissions = VALUES(permissions)`,
          [adm.id || null, adm.name, adm.email, adm.password, adm.role || 'admin', adm.permissions || 'ALL', toDateTime(adm.created_at)]
        );
      }
      console.log(`✅ Admins migrated: ${rawData.admins.length}`);
    }

    // 2. Migrate Departments
    if (Array.isArray(rawData.departments) && rawData.departments.length > 0) {
      console.log(`⏳ Migrating ${rawData.departments.length} Departments...`);
      for (const dept of rawData.departments) {
        await query(
          `INSERT INTO departments (id, department_name, department_code, description, status, created_at)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, NOW()))
           ON DUPLICATE KEY UPDATE department_code = VALUES(department_code), description = VALUES(description), status = VALUES(status)`,
          [dept.id || null, dept.department_name, dept.department_code || '', dept.description || '', dept.status || 'active', toDateTime(dept.created_at)]
        );
      }
      console.log(`✅ Departments migrated: ${rawData.departments.length}`);
    }

    // 3. Migrate Courses
    if (Array.isArray(rawData.courses) && rawData.courses.length > 0) {
      console.log(`⏳ Migrating ${rawData.courses.length} Courses...`);
      for (const c of rawData.courses) {
        await query(
          `INSERT INTO courses (id, course_name, description, trainer, duration, start_date, end_date, max_students, fee, image_url, status, created_at)
           VALUES (?, ?, ?, ?, ?, COALESCE(?, '2026-08-01'), COALESCE(?, '2026-12-31'), ?, ?, ?, ?, COALESCE(?, NOW()))
           ON DUPLICATE KEY UPDATE course_name = VALUES(course_name), fee = VALUES(fee), status = VALUES(status)`,
          [
            c.id || null,
            c.course_name,
            c.description || '',
            c.trainer || 'Faculty',
            c.duration || '60 Hours',
            toDateOnly(c.start_date),
            toDateOnly(c.end_date),
            c.max_students || 60,
            Number(c.fee || 0),
            c.image_url || '',
            c.status || 'active',
            toDateTime(c.created_at)
          ]
        );
      }
      console.log(`✅ Courses migrated: ${rawData.courses.length}`);
    }

    // 4. Migrate Students
    if (Array.isArray(rawData.students) && rawData.students.length > 0) {
      console.log(`⏳ Migrating ${rawData.students.length} Students...`);
      for (const s of rawData.students) {
        await query(
          `INSERT INTO students (
            id, student_id, roll_number, name, department, academic_year,
            course_name, course_name_2, section, dob, gender, blood_group,
            father_name, mother_name, father_occupation, mother_occupation,
            phone, parent_phone, email, address, photo_url, password, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, '2005-01-01'), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))
          ON DUPLICATE KEY UPDATE
            name = VALUES(name),
            department = VALUES(department),
            academic_year = VALUES(academic_year),
            course_name = VALUES(course_name),
            course_name_2 = VALUES(course_name_2),
            phone = VALUES(phone),
            email = VALUES(email)`,
          [
            s.id || null,
            s.student_id || `STU${s.id || Math.floor(Math.random() * 100000)}`,
            s.roll_number,
            s.name,
            s.department || '',
            s.academic_year || '1st Year',
            s.course_name || '',
            s.course_name_2 || '',
            s.section || 'A',
            toDateOnly(s.dob),
            s.gender || 'Male',
            s.blood_group || 'O+',
            s.father_name || '',
            s.mother_name || '',
            s.father_occupation || '',
            s.mother_occupation || '',
            s.phone || '',
            s.parent_phone || '',
            s.email,
            s.address || '',
            s.photo_url || '',
            s.password || '$2a$10$15082005hash',
            toDateTime(s.created_at)
          ]
        );
      }
      console.log(`✅ Students migrated: ${rawData.students.length}`);
    }

    // 5. Migrate Student Courses (Enrollments)
    if (Array.isArray(rawData.student_courses) && rawData.student_courses.length > 0) {
      console.log(`⏳ Migrating ${rawData.student_courses.length} Student Course Enrollments...`);
      for (const sc of rawData.student_courses) {
        await query(
          `INSERT INTO student_courses (
            id, student_id, course_id, assigned_date, fee_amount,
            discount_amount, fine_amount, final_amount, payment_status, due_date, created_at
          )
          VALUES (?, ?, ?, COALESCE(?, NOW()), ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))
          ON DUPLICATE KEY UPDATE payment_status = VALUES(payment_status), final_amount = VALUES(final_amount)`,
          [
            sc.id || null,
            sc.student_id,
            sc.course_id,
            toDateTime(sc.assigned_date || sc.created_at),
            Number(sc.fee_amount || 0),
            Number(sc.discount_amount || 0),
            Number(sc.fine_amount || 0),
            Number(sc.final_amount || sc.fee_amount || 0),
            sc.payment_status || 'pending',
            toDateOnly(sc.due_date),
            toDateTime(sc.created_at)
          ]
        );
      }
      console.log(`✅ Student Course Enrollments migrated: ${rawData.student_courses.length}`);
    }

    // 6. Migrate Payments
    if (Array.isArray(rawData.payments) && rawData.payments.length > 0) {
      console.log(`⏳ Migrating ${rawData.payments.length} Payment Transactions...`);
      for (const p of rawData.payments) {
        await query(
          `INSERT INTO payments (
            id, invoice_number, student_id, course_id, amount, gst_amount,
            total_amount, payment_mode, transaction_id, razorpay_order_id,
            razorpay_payment_id, payment_date, status, remarks, created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()), ?, ?, COALESCE(?, NOW()))
          ON DUPLICATE KEY UPDATE
            amount = VALUES(amount),
            total_amount = VALUES(total_amount),
            status = VALUES(status),
            payment_date = VALUES(payment_date)`,
          [
            p.id || null,
            p.invoice_number,
            p.student_id,
            p.course_id,
            Number(p.amount || 0),
            Number(p.gst_amount || 0),
            Number(p.total_amount || p.amount || 0),
            p.payment_mode || 'cash',
            p.transaction_id || '',
            p.razorpay_order_id || '',
            p.razorpay_payment_id || '',
            toDateTime(p.payment_date || p.created_at),
            p.status || 'success',
            p.remarks || '',
            toDateTime(p.created_at)
          ]
        );
      }
      console.log(`✅ Payment Transactions migrated: ${rawData.payments.length}`);
    }

    // 7. Migrate Payment History
    if (Array.isArray(rawData.payment_history) && rawData.payment_history.length > 0) {
      console.log(`⏳ Migrating ${rawData.payment_history.length} Payment History Logs...`);
      for (const ph of rawData.payment_history) {
        await query(
          `INSERT INTO payment_history (id, payment_id, status, notes, created_at)
           VALUES (?, ?, ?, ?, COALESCE(?, NOW()))
           ON DUPLICATE KEY UPDATE status = VALUES(status)`,
          [ph.id || null, ph.payment_id, ph.status || 'success', ph.notes || '', toDateTime(ph.created_at)]
        );
      }
      console.log(`✅ Payment History Logs migrated: ${rawData.payment_history.length}`);
    }

    // 8. Migrate Invoices
    if (Array.isArray(rawData.invoices) && rawData.invoices.length > 0) {
      console.log(`⏳ Migrating ${rawData.invoices.length} Invoices...`);
      for (const inv of rawData.invoices) {
        await query(
          `INSERT INTO invoices (
            id, invoice_number, student_id, course_id, payment_id,
            amount, gst_amount, total_amount, pdf_path, generated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, NOW()))
          ON DUPLICATE KEY UPDATE
            total_amount = VALUES(total_amount),
            generated_at = VALUES(generated_at)`,
          [
            inv.id || null,
            inv.invoice_number,
            inv.student_id,
            inv.course_id,
            inv.payment_id,
            Number(inv.amount || 0),
            Number(inv.gst_amount || 0),
            Number(inv.total_amount || inv.amount || 0),
            inv.pdf_path || '',
            toDateTime(inv.generated_at || inv.created_at)
          ]
        );
      }
      console.log(`✅ Invoices migrated: ${rawData.invoices.length}`);
    }

    // 9. Migrate Settings
    if (Array.isArray(rawData.settings) && rawData.settings.length > 0) {
      console.log(`⏳ Migrating ${rawData.settings.length} Settings...`);
      for (const set of rawData.settings) {
        await query(
          `INSERT INTO settings (setting_key, setting_value)
           VALUES (?, ?)
           ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
          [set.setting_key, String(set.setting_value)]
        );
      }
      console.log(`✅ Settings migrated: ${rawData.settings.length}`);
    }

    // Re-enable Foreign Key checks
    await query('SET FOREIGN_KEY_CHECKS = 1');
    console.log('\n🔒 Re-enabled FOREIGN_KEY_CHECKS.');

    console.log('\n=============================================================');
    console.log('🎉 SUCCESS: All data from JSON has been migrated to MySQL DB!');
    console.log('=============================================================\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration Failed with Error:', error.message);
    try {
      await query('SET FOREIGN_KEY_CHECKS = 1');
    } catch (_) {}
    process.exit(1);
  }
}

migrate();
