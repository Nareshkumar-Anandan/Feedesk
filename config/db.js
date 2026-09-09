const mysql = require('mysql2/promise');
const dotenv = require('dotenv');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');

dotenv.config();

// Memory store fallback if MySQL is unreachable
class FallbackStore {
  constructor() {
    this.isFallback = true;
    this.dataFile = path.join(__dirname, '../data_store.json');
    this.data = {
      admins: [],
      students: [],
      courses: [],
      student_courses: [],
      payments: [],
      payment_history: [],
      invoices: [],
      settings: [
        { setting_key: 'institution_name', setting_value: 'Hindusthan College of Arts and Science' },
        { setting_key: 'institution_address', setting_value: 'Avinashi Rd, behind Nava India, Udayampalayam, Tamil Nadu 641028' },
        { setting_key: 'institution_phone', setting_value: '+91 98431 33333' },
        { setting_key: 'institution_email', setting_value: 'info@hindusthan.net' },
        { setting_key: 'institution_website', setting_value: 'https://www.hicas.ac.in' },
        { setting_key: 'razorpay_key_id', setting_value: 'rzp_test_mockkey12345' },
        { setting_key: 'academic_year', setting_value: '2025-2026' },
        { setting_key: 'pos_enabled', setting_value: 'true' },
        { setting_key: 'pos_machine_model', setting_value: 'PAX A920 Axis Bank BonusHub' },
        { setting_key: 'pos_ip_address', setting_value: '192.168.0.102' },
        { setting_key: 'pos_port', setting_value: '8080' },
        { setting_key: 'pos_terminal_id', setting_value: '15962442' }
      ],
      departments: [],
      notifications: []
    };
    this.init();
  }

  async init() {
    if (fs.existsSync(this.dataFile)) {
      try {
        const raw = fs.readFileSync(this.dataFile, 'utf8');
        this.data = JSON.parse(raw);
        if (!this.data.departments || this.data.departments.length === 0) {
          this.data.departments = [
            { id: 1, department_name: 'Information Technology', department_code: 'IT', description: 'Department of Information Technology & Software Engineering', status: 'active', created_at: new Date().toISOString() },
            { id: 2, department_name: 'Computer Science', department_code: 'CS', description: 'Department of Computer Science & Systems', status: 'active', created_at: new Date().toISOString() },
            { id: 3, department_name: 'Commerce & Accounting', department_code: 'B.Com', description: 'Department of Commerce and Financial Accounting', status: 'active', created_at: new Date().toISOString() },
            { id: 4, department_name: 'Business Administration', department_code: 'BBA', description: 'Department of Business Administration & Management', status: 'active', created_at: new Date().toISOString() },
            { id: 5, department_name: 'Electronics & Communication', department_code: 'ECE', description: 'Department of Electronics & Communication Systems', status: 'active', created_at: new Date().toISOString() },
            { id: 6, department_name: 'Mathematics', department_code: 'MATH', description: 'Department of Mathematics and Statistics', status: 'active', created_at: new Date().toISOString() }
          ];
        }

        // Standardize any legacy COUNTER_ transaction IDs to sequential HICAS-ADCOUNTER- format and reset GST
        const currentYear = new Date().getFullYear();
        if (this.data.payments && this.data.payments.length > 0) {
          let seq = 1;
          let invSeq = 1;
          this.data.payments.forEach(p => {
            p.gst_amount = 0;
            p.total_amount = Number(p.amount);
            if (!p.transaction_id || p.transaction_id.startsWith('COUNTER_') || p.transaction_id.startsWith('OFFLINE_')) {
              p.transaction_id = `HICAS-ADCOUNTER-${String(seq).padStart(6, '0')}`;
              seq++;
            }
            if (!p.invoice_number || p.invoice_number.startsWith('INV-OFF-') || p.invoice_number.startsWith('INV-') || (p.invoice_number.startsWith('HICAS-ADINV-OFF-') && !p.invoice_number.includes(`-${currentYear}-`))) {
              p.invoice_number = `HICAS-ADINV-OFF-${currentYear}-${String(invSeq).padStart(4, '0')}`;
              invSeq++;
            }
          });
        }

        if (this.data.invoices && this.data.invoices.length > 0) {
          let invSeq = 1;
          this.data.invoices.forEach(inv => {
            inv.gst_amount = 0;
            inv.total_amount = Number(inv.amount);
            if (!inv.invoice_number || inv.invoice_number.startsWith('INV-OFF-') || inv.invoice_number.startsWith('INV-') || (inv.invoice_number.startsWith('HICAS-ADINV-OFF-') && !inv.invoice_number.includes(`-${currentYear}-`))) {
              inv.invoice_number = `HICAS-ADINV-OFF-${currentYear}-${String(invSeq).padStart(4, '0')}`;
              invSeq++;
            }
          });
        }

        this.save();
        console.log('[Fallback DB] Loaded state from data_store.json');
        return;
      } catch (err) {
        console.error('[Fallback DB] Error reading file, re-initializing:', err.message);
      }
    }
    await this.seedInitial();
  }

  async seedInitial() {
    const adminPasswordHash = await bcrypt.hash('Hicas@123', 10);

    this.data.admins = [
      {
        id: 1,
        name: 'System Super Admin',
        email: 'developer@hindusthan.net',
        password: adminPasswordHash,
        role: 'super_admin',
        permissions: 'ALL',
        created_at: new Date().toISOString()
      }
    ];

    this.data.students = [];
    this.data.courses = [];
    this.data.student_courses = [];
    this.data.payments = [];
    this.data.payment_history = [];
    this.data.invoices = [];
    this.data.notifications = [];

    this.save();
  }

  async clearAllData(type = 'all') {
    if (type === 'transactions_only') {
      this.data.payments = [];
      this.data.payment_history = [];
      this.data.invoices = [];
      if (this.data.student_courses) {
        this.data.student_courses.forEach(sc => {
          sc.payment_status = 'pending';
        });
      }
    } else {
      this.data.students = [];
      this.data.courses = [];
      this.data.student_courses = [];
      this.data.payments = [];
      this.data.payment_history = [];
      this.data.invoices = [];
      this.data.notifications = [];
    }
    this.save();
    console.log(`[Fallback DB] Cleared database with mode: ${type}`);
    return true;
  }

  save() {
    try {
      fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2), 'utf8');
    } catch (err) {
      console.error('[Fallback DB] Failed to save state:', err.message);
    }
  }

  // Simulated Query execution for MySQL query abstraction
  async query(sql, params = []) {
    const s = sql.trim().toUpperCase();

    // Handling common SELECT queries
    if (s.startsWith('SELECT')) {
      if (sql.includes('FROM admins')) {
        let results = [...this.data.admins];
        if (sql.includes('WHERE email = ?') || sql.includes('WHERE email = ? OR')) {
          const val = (params[0] || '').toLowerCase();
          results = results.filter(a =>
            (a.email || '').toLowerCase() === val ||
            (a.username || '').toLowerCase() === val ||
            (a.name || '').toLowerCase() === val
          );
        } else if (sql.includes('WHERE role = ?')) {
          results = results.filter(a => (a.role || '').toLowerCase() === (params[0] || '').toLowerCase());
        } else if (sql.includes('WHERE id = ?')) {
          results = results.filter(a => a.id === Number(params[0]));
        }
        return [results];
      }

      if (sql.includes('FROM students')) {
        let results = [...this.data.students];
        if (sql.includes('WHERE roll_number = ?') || sql.includes('WHERE student_id = ?')) {
          const val = (params[0] || '').toLowerCase();
          results = results.filter(st => st.roll_number.toLowerCase() === val || st.student_id.toLowerCase() === val);
        } else if (sql.includes('WHERE id = ?')) {
          results = results.filter(st => st.id === Number(params[0]));
        } else if (sql.includes('WHERE email = ?')) {
          results = results.filter(st => st.email.toLowerCase() === (params[0] || '').toLowerCase());
        }
        return [results];
      }

      if (sql.includes('FROM departments')) {
        let results = [...(this.data.departments || [])];
        if (sql.includes('WHERE id = ?')) {
          results = results.filter(d => Number(d.id) === Number(params[0]));
        } else if (sql.includes("status = 'active'")) {
          results = results.filter(d => d.status === 'active');
        } else if (sql.includes('WHERE department_name = ?')) {
          const val = (params[0] || '').toLowerCase();
          results = results.filter(d => (d.department_name || '').toLowerCase() === val);
        }
        return [results];
      }

      if (sql.includes('FROM courses')) {
        let results = [...this.data.courses];
        if (sql.includes('WHERE id = ?')) {
          results = results.filter(c => c.id === Number(params[0]));
        } else if (sql.includes("status = 'active'")) {
          results = results.filter(c => c.status === 'active');
        }
        return [results];
      }

      if (sql.includes('FROM payments')) {
        let pList = this.data.payments.map(p => {
          const st = this.data.students.find(s => s.id === p.student_id) || {};
          const cr = this.data.courses.find(c => c.id === p.course_id) || {};
          return {
            ...p,
            student_name: st.name || 'N/A',
            roll_number: st.roll_number || 'N/A',
            department: st.department || 'N/A',
            course_name: cr.course_name || 'N/A'
          };
        });
        if (params.length > 0 && sql.includes('student_id = ?')) {
          pList = pList.filter(p => p.student_id === Number(params[0]));
        }
        if (params.length > 0 && sql.includes('id = ?')) {
          pList = pList.filter(p => p.id === Number(params[0]));
        }
        if (params.length > 0 && sql.includes('invoice_number = ?')) {
          pList = pList.filter(p => p.invoice_number === params[0]);
        }
        return [pList];
      }

      if (sql.includes('FROM invoices')) {
        let invList = this.data.invoices.map(inv => {
          const st = this.data.students.find(s => s.id === inv.student_id) || {};
          const cr = this.data.courses.find(c => c.id === inv.course_id) || {};
          const p = this.data.payments.find(pay => pay.id === inv.payment_id) || {};
          return {
            ...inv,
            student_name: st.name,
            roll_number: st.roll_number,
            department: st.department,
            course_name: cr.course_name,
            transaction_id: p.transaction_id || '',
            payment_date: p.payment_date || inv.generated_at,
            payment_mode: p.payment_mode || 'online'
          };
        });
        if (params.length > 0 && sql.includes('student_id = ?')) {
          invList = invList.filter(i => i.student_id === Number(params[0]));
        }
        return [invList];
      }

      if (sql.includes('FROM student_courses')) {
        let scList = this.data.student_courses.map(sc => {
          const st = this.data.students.find(s => s.id === sc.student_id) || {};
          const cr = this.data.courses.find(c => c.id === sc.course_id) || {};
          return {
            ...sc,
            student_name: st.name,
            roll_number: st.roll_number,
            department: st.department,
            academic_year: st.academic_year,
            section: st.section,
            course_name: cr.course_name,
            trainer: cr.trainer,
            duration: cr.duration,
            start_date: cr.start_date,
            end_date: cr.end_date,
            fee: cr.fee,
            image_url: cr.image_url,
            description: cr.description
          };
        });

        if (params.length > 0 && sql.includes('student_id = ?')) {
          scList = scList.filter(sc => sc.student_id === Number(params[0]));
        }
        if (params.length > 0 && sql.includes('course_id = ?')) {
          scList = scList.filter(sc => sc.course_id === Number(params[0]));
        }
        if (params.length > 0 && sql.includes('sc.id = ?')) {
          scList = scList.filter(sc => sc.id === Number(params[0]));
        }
        return [scList];
      }

      if (sql.includes('FROM settings')) {
        return [this.data.settings];
      }

      if (sql.includes('FROM notifications')) {
        return [this.data.notifications];
      }
    }

    // Handling INSERT
    if (s.startsWith('INSERT')) {
      if (sql.includes('INTO students')) {
        const newId = this.data.students.length ? Math.max(...this.data.students.map(s => s.id)) + 1 : 1;
        const newStudent = {
          id: newId,
          student_id: params[0] || `STU${Date.now()}`,
          roll_number: params[1],
          name: params[2],
          department: params[3],
          academic_year: params[4],
          course_name: params[5],
          section: params[6],
          dob: params[7],
          gender: params[8] || 'Male',
          blood_group: params[9] || 'O+',
          father_name: params[10] || '',
          mother_name: params[11] || '',
          phone: params[12] || '',
          parent_phone: params[13] || '',
          email: params[14],
          address: params[15] || '',
          photo_url: params[16] || '',
          password: params[17],
          created_at: new Date().toISOString()
        };
        this.data.students.push(newStudent);
        this.save();
        return [{ insertId: newId, affectedRows: 1 }];
      }

      if (sql.includes('INTO departments')) {
        if (!this.data.departments) this.data.departments = [];
        const newId = this.data.departments.length ? Math.max(...this.data.departments.map(d => d.id)) + 1 : 1;
        const newDept = {
          id: newId,
          department_name: params[0],
          department_code: params[1] || '',
          description: params[2] || '',
          status: params[3] || 'active',
          created_at: new Date().toISOString()
        };
        this.data.departments.push(newDept);
        this.save();
        return [{ insertId: newId, affectedRows: 1 }];
      }

      if (sql.includes('INTO courses')) {
        const newId = this.data.courses.length ? Math.max(...this.data.courses.map(c => c.id)) + 1 : 1;
        const newCourse = {
          id: newId,
          course_name: params[0],
          description: params[1],
          trainer: params[2],
          duration: params[3],
          start_date: params[4],
          end_date: params[5],
          max_students: Number(params[6]) || 60,
          fee: Number(params[7]),
          image_url: params[8] || '',
          status: params[9] || 'active',
          created_at: new Date().toISOString()
        };
        this.data.courses.push(newCourse);
        this.save();
        return [{ insertId: newId, affectedRows: 1 }];
      }

      if (sql.includes('INTO student_courses')) {
        const newId = this.data.student_courses.length ? Math.max(...this.data.student_courses.map(sc => sc.id)) + 1 : 1;
        const newSC = {
          id: newId,
          student_id: Number(params[0]),
          course_id: Number(params[1]),
          assigned_date: new Date().toISOString(),
          fee_amount: Number(params[2]),
          discount_amount: Number(params[3] || 0),
          fine_amount: Number(params[4] || 0),
          final_amount: Number(params[5]),
          payment_status: params[6] || 'pending',
          due_date: params[7] || null,
          created_at: new Date().toISOString()
        };
        this.data.student_courses.push(newSC);
        this.save();
        return [{ insertId: newId, affectedRows: 1 }];
      }

      if (sql.includes('INTO payments')) {
        const newId = this.data.payments.length ? Math.max(...this.data.payments.map(p => p.id)) + 1 : 1;
        const newPayment = {
          id: newId,
          invoice_number: params[0],
          student_id: Number(params[1]),
          course_id: Number(params[2]),
          amount: Number(params[3]),
          gst_amount: Number(params[4] || 0),
          total_amount: Number(params[5]),
          payment_mode: params[6],
          transaction_id: params[7] || '',
          razorpay_order_id: params[8] || '',
          razorpay_payment_id: params[9] || '',
          payment_date: new Date().toISOString(),
          status: params[10] || 'success',
          remarks: params[11] || '',
          created_at: new Date().toISOString()
        };
        this.data.payments.push(newPayment);

        // Update student_courses status for student
        this.data.student_courses.forEach(item => {
          if (item.student_id === newPayment.student_id && newPayment.status === 'success') {
            item.payment_status = 'paid';
          }
        });
        this.save();
        return [{ insertId: newId, affectedRows: 1 }];
      }

      if (sql.includes('INTO invoices')) {
        const newId = this.data.invoices.length ? Math.max(...this.data.invoices.map(i => i.id)) + 1 : 1;
        const newInv = {
          id: newId,
          invoice_number: params[0],
          student_id: Number(params[1]),
          course_id: Number(params[2]),
          payment_id: Number(params[3]),
          amount: Number(params[4]),
          gst_amount: Number(params[5] || 0),
          total_amount: Number(params[6]),
          pdf_path: params[7] || '',
          generated_at: new Date().toISOString()
        };
        this.data.invoices.push(newInv);
        this.save();
        return [{ insertId: newId, affectedRows: 1 }];
      }

      if (sql.includes('INTO admins')) {
        const newId = this.data.admins.length ? Math.max(...this.data.admins.map(a => a.id)) + 1 : 1;
        const newAdmin = {
          id: newId,
          name: params[0],
          email: params[1],
          password: params[2],
          role: params[3] || 'admin',
          counter_location: params[4] || '',
          permissions: params[4] || '',
          created_at: new Date().toISOString()
        };
        this.data.admins.push(newAdmin);
        this.save();
        return [{ insertId: newId, affectedRows: 1 }];
      }
    }

    // Handling UPDATE
    if (s.startsWith('UPDATE')) {
      if (sql.includes('UPDATE students')) {
        const id = Number(params[params.length - 1]);
        const st = this.data.students.find(item => item.id === id);
        if (st) {
          if (params.length >= 13) {
            st.roll_number = params[0];
            st.name = params[1];
            st.department = params[2];
            st.course_name = params[3];
            st.dob = params[4];
            st.father_name = params[5];
            st.father_occupation = params[6];
            st.mother_name = params[7];
            st.mother_occupation = params[8];
            st.phone = params[9];
            st.parent_phone = params[10];
            st.email = params[11];
            st.address = params[12];
          } else {
            if (sql.includes('phone = ?')) st.phone = params[0];
            if (sql.includes('email = ?')) st.email = params[1];
            if (sql.includes('address = ?')) st.address = params[2];
          }
          this.save();
          return [{ affectedRows: 1 }];
        }
      }

      if (sql.includes('UPDATE departments')) {
        const id = Number(params[params.length - 1]);
        if (!this.data.departments) this.data.departments = [];
        const dept = this.data.departments.find(item => Number(item.id) === id);
        if (dept) {
          if (sql.trim().toUpperCase().startsWith('UPDATE DEPARTMENTS SET STATUS = ? WHERE ID = ?')) {
            dept.status = params[0];
          } else {
            const oldName = dept.department_name;
            dept.department_name = params[0] || dept.department_name;
            dept.department_code = params[1] !== undefined ? params[1] : dept.department_code;
            dept.description = params[2] !== undefined ? params[2] : dept.description;
            if (params[3]) dept.status = params[3];

            if (oldName && oldName !== dept.department_name && this.data.students) {
              this.data.students.forEach(st => {
                if (st.department === oldName) st.department = dept.department_name;
              });
            }
          }
          this.save();
          return [{ affectedRows: 1 }];
        }
      }

      if (sql.includes('UPDATE courses')) {
        const id = Number(params[params.length - 1]);
        const c = this.data.courses.find(item => Number(item.id) === id);
        if (c) {
          if (sql.trim().toUpperCase().startsWith('UPDATE COURSES SET STATUS = ? WHERE ID = ?')) {
            c.status = params[0];
          } else {
            const oldName = c.course_name;
            c.course_name = params[0] || c.course_name;
            c.description = params[1] !== undefined ? params[1] : c.description;
            c.trainer = params[2] !== undefined ? params[2] : c.trainer;
            c.duration = params[3] !== undefined ? params[3] : c.duration;
            c.start_date = params[4] || c.start_date;
            c.end_date = params[5] || c.end_date;
            c.max_students = Number(params[6]) !== undefined && !isNaN(Number(params[6])) ? Number(params[6]) : c.max_students;
            c.fee = Number(params[7]) !== undefined && !isNaN(Number(params[7])) ? Number(params[7]) : c.fee;
            if (params[8]) c.status = params[8];

            if (oldName && oldName !== c.course_name && this.data.students) {
              this.data.students.forEach(st => {
                if (st.course_name === oldName) st.course_name = c.course_name;
              });
            }
          }
          this.save();
          return [{ affectedRows: 1 }];
        }
      }

      if (sql.includes('UPDATE student_courses')) {
        const studentId = Number(params[0]);
        this.data.student_courses.forEach(sc => {
          if (sc.student_id === studentId || sc.id === studentId) {
            sc.payment_status = 'paid';
          }
        });
        this.save();
        return [{ affectedRows: 1 }];
      }

      if (sql.includes('UPDATE student_courses')) {
        if (sql.includes('payment_status = ?')) {
          const status = params[0];
          const student_id = Number(params[1]);
          const course_id = Number(params[2]);
          const sc = this.data.student_courses.find(item => item.student_id === student_id && item.course_id === course_id);
          if (sc) {
            sc.payment_status = status;
            this.save();
            return [{ affectedRows: 1 }];
          }
        }
      }

      if (sql.includes('UPDATE payments')) {
        const id = Number(params[params.length - 1]);
        const p = this.data.payments.find(item => item.id === id);
        if (p) {
          if (sql.includes('status = ?')) p.status = params[0];
          this.save();
          return [{ affectedRows: 1 }];
        }
      }

      if (sql.includes('UPDATE admins')) {
        const id = Number(params[params.length - 1]);
        const a = this.data.admins.find(item => item.id === id);
        if (a) {
          if (sql.includes('password = ?')) {
            a.name = params[0];
            a.email = params[1];
            a.password = params[2];
            a.role = params[3] || a.role;
            a.counter_location = params[4] || a.counter_location;
          } else {
            a.name = params[0];
            a.email = params[1];
            a.role = params[2] || a.role;
            a.counter_location = params[3] || a.counter_location;
          }
          this.save();
          return [{ affectedRows: 1 }];
        }
      }
    }

    // Handling DELETE
    if (s.startsWith('DELETE')) {
      if (sql.includes('FROM admins')) {
        const id = Number(params[0]);
        this.data.admins = this.data.admins.filter(item => item.id !== id);
        this.save();
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM students')) {
        const id = Number(params[0]);
        this.data.students = this.data.students.filter(item => item.id !== id);
        this.save();
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM departments')) {
        const id = Number(params[0]);
        if (!this.data.departments) this.data.departments = [];
        this.data.departments = this.data.departments.filter(item => Number(item.id) !== id);
        this.save();
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM courses')) {
        const id = Number(params[0]);
        this.data.courses = this.data.courses.filter(item => item.id !== id);
        this.save();
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('FROM payments')) {
        const id = Number(params[0]);
        const paymentToDelete = this.data.payments.find(p => p.id === id);
        if (paymentToDelete) {
          const studentId = paymentToDelete.student_id;
          const courseId = paymentToDelete.course_id;

          this.data.payments = this.data.payments.filter(item => item.id !== id);
          this.data.invoices = this.data.invoices.filter(item => item.payment_id !== id && item.invoice_number !== paymentToDelete.invoice_number);

          // Check if student still has any remaining successful payment for this course
          const remainingPayments = this.data.payments.filter(p => p.student_id === studentId && p.course_id === courseId && p.status === 'success');
          if (remainingPayments.length === 0) {
            this.data.student_courses.forEach(sc => {
              if (sc.student_id === studentId && (sc.course_id === courseId || !courseId)) {
                sc.payment_status = 'pending';
              }
            });
          }
          this.save();
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 0 }];
      }
      if (sql.includes('FROM invoices')) {
        const id = Number(params[0]);
        this.data.invoices = this.data.invoices.filter(item => item.id !== id && item.payment_id !== id);
        this.save();
        return [{ affectedRows: 1 }];
      }
    }

    return [[]];
  }
}

let dbPool = null;
let fallbackInstance = null;

async function autoInitMySQL(host, user, password, port, dbName) {
  try {
    // 1. Connect without selecting database to ensure database exists
    const initialConn = await mysql.createConnection({
      host,
      user,
      password,
      port
    });

    await initialConn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await initialConn.end();

    // 2. Connect to the database and create tables
    const conn = await mysql.createConnection({
      host,
      user,
      password,
      database: dbName,
      port
    });

    await conn.query(`
      CREATE TABLE IF NOT EXISTS admins (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(150) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role ENUM('super_admin', 'admin', 'fee_counter', 'counter_operator') DEFAULT 'admin',
        counter_location VARCHAR(100) DEFAULT '',
        permissions TEXT NULL,
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
        address TEXT DEFAULT '',
        photo_url VARCHAR(255) DEFAULT '',
        password VARCHAR(255) NOT NULL,
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
        remarks TEXT DEFAULT '',
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
        notes TEXT DEFAULT '',
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
      ['institution_name', 'Hindusthan College of Arts and Science'],
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
    console.log('✅ [Auto-Init] MySQL Database schema and tables verified & ready.');
  } catch (err) {
    console.warn('[Auto-Init Notice]:', err.message);
  }
}

async function getDbConnection() {
  if (dbPool) return dbPool;
  if (fallbackInstance) return fallbackInstance;

  const host = process.env.DB_HOST || 'localhost';
  const user = process.env.DB_USER || 'root';
  const password = process.env.DB_PASS || '';
  const database = process.env.DB_NAME || 'student_course_db';
  const port = process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306;

  try {
    // Automatically verify/create database and tables if missing
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

    // Test connection with a quick ping
    const connection = await pool.getConnection();
    connection.release();
    console.log('✅ Connected to MySQL Database successfully.');
    
    // Auto sync any historical records with GST to pure base course fee
    pool.query('UPDATE payments SET gst_amount = 0, total_amount = amount WHERE gst_amount > 0').catch(() => {});
    pool.query('UPDATE invoices SET gst_amount = 0, total_amount = amount WHERE gst_amount > 0').catch(() => {});

    dbPool = pool;
    return dbPool;
  } catch (err) {
    console.warn(`⚠️ MySQL Connection Failed (${err.message}). Using persistent JSON Fallback Engine.`);
    fallbackInstance = new FallbackStore();
    return fallbackInstance;
  }
}

// Wrapper query execution function
async function query(sql, params) {
  const db = await getDbConnection();
  if (db.isFallback) {
    return await db.query(sql, params);
  }
  return await db.query(sql, params);
}

module.exports = {
  getDbConnection,
  query
};
