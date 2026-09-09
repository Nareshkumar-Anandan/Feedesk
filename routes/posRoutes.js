const express = require('express');
const router = express.Router();
const posController = require('../controllers/posController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.post('/push', authenticateToken, posController.pushPosTransaction);
router.post('/verify', authenticateToken, posController.processPosCallback);
router.get('/status', authenticateToken, posController.getPosStatus);
router.post('/test-connection', authenticateToken, requireRole(['super_admin', 'admin']), posController.testPosConnection);
router.get('/scan-subnet', authenticateToken, requireRole(['super_admin', 'admin']), posController.scanPosSubnet);

module.exports = router;
