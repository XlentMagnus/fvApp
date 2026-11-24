const { Router } = require('express');
const authController = require('../controllers/authController');
const { loginLimiter } = require('../middleware/rateLimit');

const router = Router();

router.post('/login', loginLimiter.check, authController.login);
router.post('/logout', authController.logout);
router.get('/me', authController.me);

module.exports = router;
