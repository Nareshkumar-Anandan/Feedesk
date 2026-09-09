const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const { query } = require('../config/db');

const invoicesDir = path.join(__dirname, '../invoices');
if (!fs.existsSync(invoicesDir)) {
  fs.mkdirSync(invoicesDir, { recursive: true });
}

// Internal function to create PDF and QR code
exports.generateInvoicePdfInternal = async (data) => {
  return new Promise(async (resolve, reject) => {
    try {
      const {
        invoice_number, student_id, course_id, amount, gst_amount, total_amount,
        transaction_id, payment_date, payment_mode
      } = data;

      // Fetch Student & Course details
      const [stRows] = await query('SELECT * FROM students WHERE id = ?', [student_id]);
      const [crRows] = await query('SELECT * FROM courses WHERE id = ?', [course_id]);

      const student = (stRows && stRows.length) ? stRows[0] : { name: 'Student Name', roll_number: 'N/A', department: 'N/A', email: 'N/A' };
      const course = (crRows && crRows.length) ? crRows[0] : { course_name: 'Value Added Course', trainer: 'Faculty' };

      const fileName = `${invoice_number}.pdf`;
      const filePath = path.join(invoicesDir, fileName);

      // Generate QR Code Buffer
      const qrDataStr = `Invoice: ${invoice_number}\nStudent: ${student.name} (${student.roll_number})\nCourse: ${course.course_name}\nTotal: Rs.${total_amount}\nTxn: ${transaction_id}`;
      const qrBuffer = await QRCode.toBuffer(qrDataStr, { width: 100, margin: 1 });

      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const writeStream = fs.createWriteStream(filePath);
      doc.pipe(writeStream);

      // Header Banner Styling (Institutional Color #0F4C81)
      doc.rect(0, 0, 595.28, 90).fill('#0F4C81');
      doc.fillColor('#FFFFFF')
         .fontSize(18)
         .font('Helvetica-Bold')
         .text('HINDUSTHAN COLLEGE OF ARTS AND SCIENCE', 40, 22);
      doc.fontSize(9.5)
         .font('Helvetica')
         .text('Avinashi Road, Nava India, Udayampalayam, Coimbatore, Tamil Nadu 641028', 40, 48);
      doc.fontSize(12)
         .font('Helvetica-Bold')
         .text('TAX INVOICE & RECEIPT', 40, 66);

      // Reset fill color
      doc.fillColor('#333333');

      // Invoice Details Block
      doc.fontSize(10).font('Helvetica-Bold').text(`Invoice Number:`, 40, 110);
      doc.font('Helvetica').text(`${invoice_number}`, 140, 110);

      doc.font('Helvetica-Bold').text(`Payment Date:`, 40, 125);
      doc.font('Helvetica').text(`${payment_date || new Date().toLocaleDateString('en-IN')}`, 140, 125);

      doc.font('Helvetica-Bold').text(`Transaction ID:`, 40, 140);
      doc.font('Helvetica').text(`${transaction_id}`, 140, 140);

      doc.font('Helvetica-Bold').text(`Payment Mode:`, 40, 155);
      doc.font('Helvetica').text(`${(payment_mode || 'Online').toUpperCase()}`, 140, 155);

      // Add QR Code at Top Right
      doc.image(qrBuffer, 440, 105, { width: 90 });

      // Divider Line
      doc.moveTo(40, 185).lineTo(555, 185).strokeColor('#E2E8F0').lineWidth(1).stroke();

      // Billed To Student Block
      doc.fillColor('#0F4C81').fontSize(12).font('Helvetica-Bold').text('BILLED TO STUDENT', 40, 200);
      doc.fillColor('#333333').fontSize(10).font('Helvetica');
      doc.text(`Student Name: ${student.name}`, 40, 220);
      doc.text(`Roll Number: ${student.roll_number} | Student ID: ${student.student_id || 'N/A'}`, 40, 235);
      doc.text(`Department: ${student.department || 'N/A'} | Academic Year: ${student.academic_year || 'N/A'}`, 40, 250);
      doc.text(`Email: ${student.email}`, 40, 265);
      doc.text(`Contact Phone: ${student.phone || 'N/A'}`, 40, 280);

      // Course Particulars Table Header
      const tableTop = 310;
      doc.rect(40, tableTop, 515, 25).fill('#F8FAFC');
      doc.fillColor('#0F4C81').fontSize(10).font('Helvetica-Bold');
      doc.text('SI', 50, tableTop + 7);
      doc.text('Course Name & Trainer', 90, tableTop + 7);
      doc.text('Duration', 340, tableTop + 7);
      doc.text('Fee (INR)', 470, tableTop + 7, { width: 75, align: 'right' });

      // Table Row
      const rowTop = tableTop + 30;
      doc.fillColor('#333333').font('Helvetica');
      doc.text('1', 50, rowTop);
      doc.text(`${course.course_name}`, 90, rowTop, { width: 240 });
      doc.fontSize(8).fillColor('#64748B').text(`Trainer: ${course.trainer}`, 90, rowTop + 14);
      doc.fontSize(10).fillColor('#333333').text(`${course.duration || '30 Hours'}`, 340, rowTop);
      doc.text(`Rs. ${Number(amount).toFixed(2)}`, 470, rowTop, { width: 75, align: 'right' });

      // Total Breakdown Section
      const summaryTop = rowTop + 45;
      doc.moveTo(40, summaryTop).lineTo(555, summaryTop).strokeColor('#E2E8F0').stroke();

      doc.fontSize(10).font('Helvetica').text('Course Fee:', 340, summaryTop + 15);
      doc.text(`Rs. ${Number(total_amount || amount).toFixed(2)}`, 470, summaryTop + 15, { width: 75, align: 'right' });

      doc.rect(330, summaryTop + 35, 225, 30).fill('#0F4C81');
      doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11);
      doc.text('TOTAL PAID:', 340, summaryTop + 45);
      doc.text(`Rs. ${Number(total_amount || amount).toFixed(2)}`, 470, summaryTop + 45, { width: 75, align: 'right' });

      // Terms & Authorized Stamp/Signature
      doc.fillColor('#64748B').fontSize(8).font('Helvetica');
      doc.text('Terms & Conditions:', 40, summaryTop + 100);
      doc.text('1. This is a computer-generated official receipt for skill course enrollment.', 40, summaryTop + 112);
      doc.text('2. Course fees are non-refundable after commencement of classes.', 40, summaryTop + 124);

      // Signature Placeholder
      doc.fillColor('#0F4C81').fontSize(10).font('Helvetica-Bold');
      doc.text('Authorized Finance Controller', 380, summaryTop + 130, { align: 'right' });
      doc.fontSize(8).fillColor('#64748B').text('Hindusthan College of Arts and Science', 380, summaryTop + 145, { align: 'right' });

      doc.end();

      writeStream.on('finish', () => {
        const publicPath = `/invoices/${fileName}`;
        // Attempt email dispatch asynchronously
        exports.sendInvoiceEmail(student.email, student.name, invoice_number, course.course_name, filePath).catch(e => console.warn('Email dispatch warning:', e.message));
        resolve(publicPath);
      });

      writeStream.on('error', (err) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
};

// Helper function to send invoice via SendGrid API
exports.sendInvoiceEmail = async (studentEmail, studentName, invoiceNumber, courseName, pdfFilePath) => {
  try {
    if (!studentEmail || studentEmail === 'N/A' || studentEmail.endsWith('@student.edu')) {
      console.log(`[SendGrid API Notice] Invoice ${invoiceNumber} email to ${studentEmail} skipped or simulated.`);
      return;
    }

    const sgApiKey = process.env.SENDGRID_API_KEY;
    const smtpUser = process.env.SMTP_USER;

    if (!sgApiKey && (!smtpUser || smtpUser !== 'apikey')) {
      console.log(`[SendGrid API Notice] SendGrid credentials unconfigured. Invoice ${invoiceNumber} email to ${studentEmail} simulated.`);
      return;
    }

    const transporter = nodemailer.createTransport({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: sgApiKey || process.env.SMTP_PASS
      }
    });

    const mailOptions = {
      from: process.env.SENDGRID_FROM_EMAIL || process.env.EMAIL_FROM || '"FeeDesk Admin" <no-reply@hindusthan.net>',
      to: studentEmail,
      subject: `Payment Successful - Course Invoice & Receipt [${invoiceNumber}]`,
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; color: #333;">
          <h2 style="color: #EA580C;">Payment Successful!</h2>
          <p>Dear <strong>${studentName}</strong>,</p>
          <p>Thank you for enrolling in <strong>${courseName}</strong>. Your payment has been received successfully.</p>
          <p><strong>Invoice Number:</strong> ${invoiceNumber}</p>
          <p>Attached to this email is your official Tax Invoice and Payment Receipt in PDF format.</p>
          <br>
          <p>Best regards,<br><strong>Finance & Course Management Team</strong><br>Hindusthan Educational Institutions</p>
        </div>
      `,
      attachments: [
        {
          filename: `${invoiceNumber}.pdf`,
          path: pdfFilePath
        }
      ]
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ SendGrid: Invoice email sent successfully to ${studentEmail}`);
  } catch (error) {
    console.error('SendGrid Email Notice:', error.message);
  }
};

// API Endpoint to get all invoices with student and course details
exports.getInvoicesList = async (req, res) => {
  try {
    const [rows] = await query(`
      SELECT i.*, s.name as student_name, s.roll_number, s.department, s.email, s.phone,
             c.course_name, c.fee, p.payment_mode, p.payment_date, p.transaction_id, p.remarks
      FROM invoices i
      LEFT JOIN students s ON i.student_id = s.id
      LEFT JOIN courses c ON i.course_id = c.id
      LEFT JOIN payments p ON i.payment_id = p.id
      ORDER BY i.id DESC
    `);
    res.json({ success: true, data: rows || [] });
  } catch (error) {
    console.error('Get Invoices List Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch invoices.' });
  }
};

// API Endpoint to get single invoice by invoice_number
exports.getInvoiceByNumber = async (req, res) => {
  try {
    const { invoice_number } = req.params;
    const [rows] = await query(`
      SELECT i.*, s.name as student_name, s.roll_number, s.department, s.email, s.phone,
             c.course_name, c.fee, p.payment_mode, p.payment_date, p.transaction_id, p.remarks
      FROM invoices i
      LEFT JOIN students s ON i.student_id = s.id
      LEFT JOIN courses c ON i.course_id = c.id
      LEFT JOIN payments p ON i.payment_id = p.id
      WHERE i.invoice_number = ?
    `, [invoice_number]);

    if (!rows || rows.length === 0) {
      // Fallback: search in payments table directly
      const [payRows] = await query(`
        SELECT p.*, s.name as student_name, s.roll_number, s.department, s.email, s.phone,
               c.course_name, c.fee
        FROM payments p
        LEFT JOIN students s ON p.student_id = s.id
        LEFT JOIN courses c ON p.course_id = c.id
        WHERE p.invoice_number = ?
      `, [invoice_number]);

      if (payRows && payRows.length > 0) {
        return res.json({ success: true, data: payRows[0] });
      }

      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }

    res.json({ success: true, data: rows[0] });
  } catch (error) {
    console.error('Get Invoice By Number Error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch invoice details.' });
  }
};

// API Endpoint to download PDF
exports.downloadInvoicePdf = async (req, res) => {
  try {
    const { invoice_number } = req.params;
    const filePath = path.join(invoicesDir, `${invoice_number}.pdf`);

    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice_number}.pdf"`);
      return res.sendFile(filePath);
    }

    // If PDF file doesn't exist on disk, attempt lookup in database and regenerate
    const [rows] = await query('SELECT * FROM invoices WHERE invoice_number = ?', [invoice_number]);
    if (!rows || rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Invoice not found.' });
    }

    const inv = rows[0];
    const newPdfPath = await exports.generateInvoicePdfInternal({
      invoice_number: inv.invoice_number,
      student_id: inv.student_id,
      course_id: inv.course_id,
      payment_id: inv.payment_id,
      amount: inv.amount,
      gst_amount: inv.gst_amount,
      total_amount: inv.total_amount,
      transaction_id: inv.invoice_number,
      payment_date: inv.generated_at
    });

    const regeneratedPath = path.join(__dirname, '..', newPdfPath);
    if (fs.existsSync(regeneratedPath)) {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="${invoice_number}.pdf"`);
      return res.sendFile(regeneratedPath);
    }

    res.status(404).json({ success: false, message: 'Invoice PDF generation failed.' });
  } catch (error) {
    console.error('Download Invoice Error:', error);
    res.status(500).json({ success: false, message: 'Failed to download invoice.' });
  }
};
