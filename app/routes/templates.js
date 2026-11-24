const { Router } = require('express');
const templateController = require('../controllers/templateController');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

router.get('/', requireAdmin, templateController.list);
router.get('/:id', requireAdmin, templateController.getById);
router.post('/', requireAdmin, templateController.create);
router.put('/:id', requireAdmin, templateController.update);
router.delete('/:id', requireAdmin, templateController.delete);
router.post('/:id/generate', requireAdmin, templateController.generate);

module.exports = router;
