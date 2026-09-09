const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, paymentController.getPaymentsList);
router.post('/razorpay/create-order', authenticateToken, paymentController.createRazorpayOrder);
router.post('/razorpay/verify', authenticateToken, paymentController.verifyPayment);
router.post('/offline', authenticateToken, requireRole(['super_admin', 'admin', 'fee_counter', 'counter_operator']), paymentController.recordOfflinePayment);
router.put('/fee-structure', authenticateToken, requireRole(['super_admin', 'admin']), paymentController.updateFeeDetails);
router.delete('/:id', authenticateToken, requireRole(['super_admin', 'admin']), paymentController.deletePayment);

module.exports = router;

