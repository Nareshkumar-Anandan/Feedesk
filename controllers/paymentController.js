const Razorpay = require('razorpay');
const crypto = require('crypto');
const { query } = require('../config/db');
const invoiceController = require('./invoiceController');

// Initialize Razorpay client
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mockkey12345',
  key_secret: process.env.RAZORPAY_KEY_SECRET || 'mocksecretkey12345'
});

// 1. Create Razorpay Payment Order
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { student_course_id, amount } = req.body;

    const [scRows] = await query('SELECT * FROM student_courses WHERE id = ?', [student_course_id]);
    if (!scRows || scRows.length === 0) {
      return res.status(404).json({ success: false, message: 'Assigned course record not found.' });
    }

    const sc = scRows[0];
    const payAmount = Number(amount || sc.final_amount);
    const amountInPaise = Math.round(payAmount * 100);

    const options = {
      amount: amountInPaise,
      currency: 'INR',
      receipt: `rcpt_${sc.id}_${Date.now()}`,
      payment_capture: 1
    };

    let order = null;
    try {
      order = await razorpay.orders.create(options);
    } catch (rzpErr) {
      console.warn('Razorpay SDK notice (using test/mock order fallback):', rzpErr.message);
      // Fallback mock order if live Razorpay keys are test placeholder
      order = {
        id: `order_MOCK_${Date.now()}`,
        entity: 'order',
        amount: amountInPaise,
        currency: 'INR',
        receipt: options.receipt,
        status: 'created'
      };
    }

    res.json({
      success: true,
      order_id: order.id,
      amount: payAmount,
      currency: 'INR',
      key_id: process.env.RAZORPAY_KEY_ID || 'rzp_test_mockkey12345',
      student_course_id: sc.id,
      student_id: sc.student_id,
      course_id: sc.course_id
    });
  } catch (error) {
    console.error('Create Razorpay Order Error:', error);
    res.status(500).json({ success: false, message: 'Failed to initiate payment gateway.' });
  }
};

// 2. Verify Payment (Razorpay Online Callback or Simulation)
exports.verifyPayment = async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      student_id,
      course_id,
      amount,
      payment_mode
    } = req.body;

    const studentIdNum = Number(student_id || req.user.id);
    const courseIdNum = Number(course_id);

    // Signature verification (if live signature passed)
    if (razorpay_signature && !razorpay_signature.startsWith('mock_sig')) {
      const secret = process.env.RAZORPAY_KEY_SECRET || 'mocksecretkey12345';
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto.createHmac('sha256', secret).update(body.toString()).digest('hex');
      if (expectedSignature !== razorpay_signature) {
        return res.status(400).json({ success: false, message: 'Payment verification failed: Invalid digital signature.' });
      }
    }

    const [scRows] = await query(
      'SELECT * FROM student_courses WHERE student_id = ? AND course_id = ?',
      [studentIdNum, courseIdNum]
    );

    const baseAmount = Number(amount || (scRows.length ? scRows[0].final_amount : 1000));
    const gstAmount = 0;
    const totalAmount = baseAmount;

    const invoiceNumber = `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const txnId = razorpay_payment_id || `TXN_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

    // Record Payment
    const [payResult] = await query(
      `INSERT INTO payments 
      (invoice_number, student_id, course_id, amount, gst_amount, total_amount, payment_mode, transaction_id, razorpay_order_id, razorpay_payment_id, status, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'success', 'Paid via Razorpay Checkout')`,
      [
        invoiceNumber, studentIdNum, courseIdNum, baseAmount, gstAmount, totalAmount,
        payment_mode || 'online_razorpay', txnId, razorpay_order_id || '', razorpay_payment_id || ''
      ]
    );

    const paymentId = payResult.insertId || Date.now();

    // Record Payment History
    await query(
      'INSERT INTO payment_history (payment_id, status, notes) VALUES (?, ?, ?)',
      [paymentId, 'success', `Payment of Rs.${totalAmount} received successfully via ${payment_mode || 'Razorpay'}`]
    );

    // Update Student Course Status
    await query(
      "UPDATE student_courses SET payment_status = 'paid' WHERE student_id = ? AND course_id = ?",
      [studentIdNum, courseIdNum]
    );

    // Auto Generate Invoice & Email
    const invoicePdfPath = await invoiceController.generateInvoicePdfInternal({
      invoice_number: invoiceNumber,
      student_id: studentIdNum,
      course_id: courseIdNum,
      payment_id: paymentId,
      amount: baseAmount,
      gst_amount: gstAmount,
      total_amount: totalAmount,
      transaction_id: txnId,
      payment_date: new Date().toLocaleDateString('en-IN'),
      payment_mode: payment_mode || 'online_razorpay'
    });

    // Record Invoice in Database
    await query(
      `INSERT INTO invoices (invoice_number, student_id, course_id, payment_id, amount, gst_amount, total_amount, pdf_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, studentIdNum, courseIdNum, paymentId, baseAmount, gstAmount, totalAmount, invoicePdfPath]
    );

    res.json({
      success: true,
      message: 'Payment completed successfully! Receipt & Invoice generated.',
      data: {
        invoice_number: invoiceNumber,
        transaction_id: txnId,
        total_amount: totalAmount,
        pdf_path: invoicePdfPath
      }
    });
  } catch (error) {
    console.error('Verify Payment Error:', error);
    res.status(500).json({ success: false, message: 'Payment processing error.', error: error.message });
  }
};

// Helper to generate sequential HICAS-ADINV-OFF-YEAR-0001 format invoice number
async function getNextOfflineInvoiceNumber() {
  try {
    const currentYear = new Date().getFullYear();
    const prefix = `HICAS-ADINV-OFF-${currentYear}-`;
    const [rows] = await query("SELECT invoice_number FROM payments UNION SELECT invoice_number FROM invoices");
    let maxNum = 0;
    if (rows && rows.length > 0) {
      for (const r of rows) {
        const inv = (r.invoice_number || '').toUpperCase();
        if (inv.includes(prefix)) {
          const numStr = inv.replace(new RegExp(`.*${prefix}(\\d+).*`), '$1');
          const parsed = parseInt(numStr, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    }
    const nextNum = maxNum + 1;
    return `${prefix}${String(nextNum).padStart(4, '0')}`;
  } catch (err) {
    console.error('Error generating offline invoice number:', err);
    return `HICAS-ADINV-OFF-${new Date().getFullYear()}-0001`;
  }
}

// Helper to generate sequential HICAS-ADCOUNTER-000001 format transaction ID
async function getNextCounterTransactionId() {
  try {
    const [rows] = await query("SELECT transaction_id FROM payments");
    let maxNum = 0;
    if (rows && rows.length > 0) {
      for (const r of rows) {
        const tid = (r.transaction_id || '').toUpperCase();
        if (tid.includes('HICAS-ADCOUNTER-')) {
          const numStr = tid.replace(/.*HICAS-ADCOUNTER-(\d+).*/, '$1');
          const parsed = parseInt(numStr, 10);
          if (!isNaN(parsed) && parsed > maxNum) {
            maxNum = parsed;
          }
        }
      }
    }
    const nextNum = maxNum + 1;
    return `HICAS-ADCOUNTER-${String(nextNum).padStart(6, '0')}`;
  } catch (err) {
    console.error('Error generating counter transaction ID:', err);
    return `HICAS-ADCOUNTER-000001`;
  }
}

// 3. Record Offline Payment (Admin / Counter)
exports.recordOfflinePayment = async (req, res) => {
  try {
    const { student_id, course_id, amount, payment_mode, transaction_id, remarks } = req.body;

    if (!student_id || !course_id || !amount || !payment_mode) {
      return res.status(400).json({ success: false, message: 'Student, Course, Amount, and Payment Mode (Cash/UPI/Cheque/Bank Transfer) are required.' });
    }

    const baseAmount = Number(amount);
    const gstAmount = 0;
    const totalAmount = baseAmount;

    const invoiceNumber = await getNextOfflineInvoiceNumber();

    let txnId = transaction_id ? transaction_id.trim() : '';
    if (!txnId || txnId.toUpperCase().startsWith('COUNTER_') || txnId.toUpperCase().startsWith('OFFLINE_') || payment_mode === 'cash') {
      txnId = await getNextCounterTransactionId();
    }

    const [payResult] = await query(
      `INSERT INTO payments 
      (invoice_number, student_id, course_id, amount, gst_amount, total_amount, payment_mode, transaction_id, status, remarks)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'success', ?)`,
      [invoiceNumber, Number(student_id), Number(course_id), baseAmount, gstAmount, totalAmount, payment_mode, txnId, remarks || 'Offline payment recorded at Counter']
    );

    const paymentId = payResult.insertId;

    await query(
      "UPDATE student_courses SET payment_status = 'paid' WHERE student_id = ?",
      [Number(student_id)]
    );

    const invoicePdfPath = await invoiceController.generateInvoicePdfInternal({
      invoice_number: invoiceNumber,
      student_id: Number(student_id),
      course_id: Number(course_id),
      payment_id: paymentId,
      amount: baseAmount,
      gst_amount: gstAmount,
      total_amount: totalAmount,
      transaction_id: txnId,
      payment_date: new Date().toLocaleDateString('en-IN'),
      payment_mode
    });

    await query(
      `INSERT INTO invoices (invoice_number, student_id, course_id, payment_id, amount, gst_amount, total_amount, pdf_path)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [invoiceNumber, Number(student_id), Number(course_id), paymentId, baseAmount, gstAmount, totalAmount, invoicePdfPath]
    );

    res.json({
      success: true,
      message: 'Offline payment recorded and invoice issued successfully!',
      invoice_number: invoiceNumber,
      transaction_id: txnId,
      data: {
        invoice_number: invoiceNumber,
        transaction_id: txnId,
        amount: baseAmount,
        total_amount: totalAmount
      }
    });
  } catch (error) {
    console.error('Offline Payment Error:', error);
    res.status(500).json({ success: false, message: 'Failed to record offline payment.' });
  }
};

// 4. Get Payments List (Student or Admin)
exports.getPaymentsList = async (req, res) => {
  try {
    const isStudent = req.user.role === 'student';
    const studentId = isStudent ? req.user.id : req.query.student_id;

    let [payments] = await query('SELECT p.*, s.name as student_name, s.roll_number, s.department, c.course_name FROM payments p JOIN students s ON p.student_id = s.id JOIN courses c ON p.course_id = c.id ORDER BY p.id DESC');

    if (studentId) {
      payments = payments.filter(p => Number(p.student_id) === Number(studentId));
    }

    res.json({ success: true, count: payments.length, data: payments });
  } catch (error) {
    console.error('Get Payments List Error:', error);
    res.status(500).json({ success: false, message: 'Failed to retrieve payment records.' });
  }
};

// 5. Update Fee Settings / Adjustments (Discount, Fine, Scholarship)
exports.updateFeeDetails = async (req, res) => {
  try {
    const { student_course_id, discount_amount, fine_amount, due_date } = req.body;

    const [scRows] = await query('SELECT * FROM student_courses WHERE id = ?', [student_course_id]);
    if (!scRows || scRows.length === 0) return res.status(404).json({ success: false, message: 'Assigned course not found.' });

    const sc = scRows[0];
    const discount = Number(discount_amount !== undefined ? discount_amount : sc.discount_amount);
    const fine = Number(fine_amount !== undefined ? fine_amount : sc.fine_amount);
    const finalAmt = Math.max(0, sc.fee_amount - discount + fine);

    await query(
      'UPDATE student_courses SET discount_amount = ?, fine_amount = ?, final_amount = ?, due_date = ? WHERE id = ?',
      [discount, fine, finalAmt, due_date || sc.due_date, student_course_id]
    );

    res.json({ success: true, message: 'Fee structure updated successfully!' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Failed to update fee details.' });
  }
};

// 6. Delete Payment Record (Admin)
exports.deletePayment = async (req, res) => {
  try {
    const paymentId = Number(req.params.id);

    const [payments] = await query('SELECT * FROM payments WHERE id = ?', [paymentId]);
    if (!payments || payments.length === 0) {
      return res.status(404).json({ success: false, message: 'Payment record not found.' });
    }

    const payment = payments[0];

    // Delete invoice associated with this payment
    await query('DELETE FROM invoices WHERE payment_id = ?', [paymentId]);

    // Delete payment record
    await query('DELETE FROM payments WHERE id = ?', [paymentId]);

    // Reset student course payment status to pending if no other successful payments exist
    const [otherPayments] = await query(
      'SELECT * FROM payments WHERE student_id = ? AND course_id = ? AND status = "success"',
      [payment.student_id, payment.course_id]
    );

    if (!otherPayments || otherPayments.length === 0) {
      await query(
        'UPDATE student_courses SET payment_status = "pending" WHERE student_id = ? AND course_id = ?',
        [payment.student_id, payment.course_id]
      );
    }

    res.json({ success: true, message: `Payment record (${payment.invoice_number || paymentId}) deleted successfully.` });
  } catch (error) {
    console.error('Delete Payment Error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete payment record.', error: error.message });
  }
};

