const { Router } = require('express');
const categoryController = require('../controllers/categoryController');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/', categoryController.list);
router.post('/', requireAdmin, categoryController.create);
router.put('/:id', requireAdmin, categoryController.update);
router.delete('/:id', requireAdmin, categoryController.delete);

module.exports = router;
