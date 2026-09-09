const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { authenticateToken } = require('../middleware/auth');

router.post('/student/login', authController.studentLogin);
router.post('/admin/login', authController.adminLogin);
router.get('/profile', authenticateToken, authController.getProfile);

module.exports = router;
