const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/dashboard-summary', authenticateToken, requireRole(['super_admin', 'admin']), reportController.getDashboardSummary);
router.get('/export', authenticateToken, requireRole(['super_admin', 'admin']), reportController.exportReports);

module.exports = router;
