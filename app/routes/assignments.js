const { Router } = require('express');
const taskController = require('../controllers/taskController');
const { requireAuth } = require('../middleware/auth');

const router = Router();

router.put('/:id', requireAuth, taskController.updateAssignment);

module.exports = router;
