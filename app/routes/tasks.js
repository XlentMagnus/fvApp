const { Router } = require('express');
const taskController = require('../controllers/taskController');
const { requireAuth, requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/stats', requireAuth, taskController.getStats);
router.get('/calendar', requireAuth, taskController.getByDateRange);
router.get('/my', requireAuth, taskController.myTasks);

router.get('/', requireAuth, taskController.list);
router.get('/:id', requireAuth, taskController.getById);
router.post('/', requireAdmin, taskController.create);
router.post('/bulk-delete', requireAdmin, taskController.bulkDelete);
router.put('/:id', requireAdmin, taskController.update);
router.delete('/:id', requireAdmin, taskController.delete);

router.post('/:id/assign', requireAdmin, taskController.assign);
router.delete('/:id/assign/:userId', requireAdmin, taskController.unassign);

module.exports = router;
