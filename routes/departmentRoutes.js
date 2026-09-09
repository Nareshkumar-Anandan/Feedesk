const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { authenticateToken, requireRole } = require('../middleware/auth');

router.get('/', authenticateToken, departmentController.getAllDepartments);
router.get('/:id', authenticateToken, departmentController.getDepartmentById);

router.post('/', authenticateToken, requireRole(['super_admin', 'admin']), departmentController.createDepartment);
router.put('/:id', authenticateToken, requireRole(['super_admin', 'admin']), departmentController.updateDepartment);
router.patch('/:id/status', authenticateToken, requireRole(['super_admin', 'admin']), departmentController.toggleDepartmentStatus);
router.delete('/:id', authenticateToken, requireRole(['super_admin', 'admin']), departmentController.deleteDepartment);

module.exports = router;
