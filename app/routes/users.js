const { Router } = require('express');
const userController = require('../controllers/userController');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/assignment-stats', requireAdmin, userController.assignmentStats);
router.get('/', requireAdmin, userController.list);
router.get('/:id', requireAdmin, userController.getById);
router.get('/:id/assignments', requireAdmin, userController.userAssignments);
router.post('/', requireAdmin, userController.create);
router.put('/:id', requireAdmin, userController.update);
router.delete('/:id', requireAdmin, userController.delete);
router.post('/:id/regenerate-link', requireAdmin, userController.regenerateLink);

module.exports = router;
