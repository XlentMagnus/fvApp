const { Router } = require('express');
const authRoutes = require('./auth');
const userRoutes = require('./users');
const taskRoutes = require('./tasks');
const assignmentRoutes = require('./assignments');
const categoryRoutes = require('./categories');
const templateRoutes = require('./templates');
const publicRoutes = require('./public');
const auditRoutes = require('./audit');
const autoAssignRoutes = require('./autoAssign');
const overviewRoutes = require('./overview');

const router = Router();

router.use('/api/public', publicRoutes);
router.use('/api/auth', authRoutes);
router.use('/api/users', userRoutes);
router.use('/api/tasks', taskRoutes);
router.use('/api/assignments', assignmentRoutes);
router.use('/api/categories', categoryRoutes);
router.use('/api/templates', templateRoutes);
router.use('/api/audit', auditRoutes);
router.use('/api/auto-assign', autoAssignRoutes);
router.use('/api/overview', overviewRoutes);

module.exports = router;
