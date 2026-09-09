const express = require('express');
const router = express.Router();
const invoiceController = require('../controllers/invoiceController');
const { authenticateToken } = require('../middleware/auth');

router.get('/', authenticateToken, invoiceController.getInvoicesList);
router.get('/download/:invoice_number', authenticateToken, invoiceController.downloadInvoicePdf);
router.get('/:invoice_number', authenticateToken, invoiceController.getInvoiceByNumber);

module.exports = router;
