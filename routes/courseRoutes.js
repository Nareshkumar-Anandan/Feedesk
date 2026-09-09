const express = require('express');
const router = express.Router();
const courseController = require('../controllers/courseController');
const { authenticateToken, requireRole } = require('../middleware/auth');
const upload = require('../middleware/upload');

router.get('/', authenticateToken, courseController.getAllCourses);
router.get('/assigned', authenticateToken, courseController.getAssignedCourses);
router.post('/assign', authenticateToken, requireRole(['super_admin', 'admin']), courseController.assignCourse);

router.get('/:id', authenticateToken, courseController.getCourseById);
router.post('/', authenticateToken, requireRole(['super_admin', 'admin']), upload.single('image'), courseController.createCourse);
router.put('/:id', authenticateToken, requireRole(['super_admin', 'admin']), upload.single('image'), courseController.updateCourse);
router.patch('/:id/status', authenticateToken, requireRole(['super_admin', 'admin']), courseController.toggleCourseStatus);
router.delete('/:id', authenticateToken, requireRole(['super_admin', 'admin']), courseController.deleteCourse);

module.exports = router;
