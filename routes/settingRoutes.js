const express = require('express');
const router = express.Router();
const settingController = require('../controllers/settingController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, settingController.getSettings);
router.post('/', authenticateToken, requireRole(['super_admin', 'admin']), settingController.updateSettings);

router.get('/admins', authenticateToken, requireRole(['super_admin']), settingController.getAllAdmins);
router.post('/admins', authenticateToken, requireRole(['super_admin']), settingController.createAdmin);
router.delete('/admins/:id', authenticateToken, requireRole(['super_admin']), settingController.deleteAdmin);

// Fee Counter Operators Management
router.get('/fee-counters', authenticateToken, requireRole(['super_admin']), settingController.getFeeCounters);
router.post('/fee-counters', authenticateToken, requireRole(['super_admin']), settingController.createFeeCounter);
router.put('/fee-counters/:id', authenticateToken, requireRole(['super_admin']), settingController.updateFeeCounter);
router.delete('/fee-counters/:id', authenticateToken, requireRole(['super_admin']), settingController.deleteFeeCounter);

router.post('/clear-db', authenticateToken, requireRole(['super_admin']), settingController.clearDatabase);

module.exports = router;


