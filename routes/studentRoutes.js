const express = require('express');
const router = express.Router();
const studentController = require('../controllers/studentController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', authenticateToken, studentController.getAllStudents);
router.get('/export/excel', authenticateToken, requireRole(['super_admin', 'admin']), studentController.exportStudentsExcel);
router.post('/bulk-import', authenticateToken, requireRole(['super_admin', 'admin']), studentController.bulkImportStudents);
router.post('/bulk-assign-courses', authenticateToken, requireRole(['super_admin', 'admin']), studentController.bulkAssignCourses);

router.get('/:id', authenticateToken, studentController.getStudentById);
router.post('/', authenticateToken, requireRole(['super_admin', 'admin']), upload.single('photo'), studentController.createStudent);
router.put('/:id', authenticateToken, studentController.updateStudent);
router.delete('/:id', authenticateToken, requireRole(['super_admin', 'admin']), studentController.deleteStudent);
router.post('/bulk-delete', authenticateToken, requireRole(['super_admin', 'admin']), studentController.bulkDeleteStudents);
router.post('/:id/reset-password', authenticateToken, requireRole(['super_admin', 'admin']), studentController.resetPassword);

module.exports = router;
