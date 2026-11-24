const authService = require('../services/authService');
const { loginLimiter } = require('../middleware/rateLimit');

const authController = {
  async login(req, res, next) {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        return res.status(400).json({ error: 'E-post och lösenord krävs' });
      }

      const user = await authService.login(String(email), String(password));
      if (!user) {
        await loginLimiter.fail(req);
        return res.status(401).json({ error: 'Felaktig e-post eller lösenord' });
      }
      await loginLimiter.reset(req);

      // Signed cookie session (cookie-session): a fresh cookie is issued on login.
      req.session = { userId: user.id };
      res.json({ user });
    } catch (err) {
      next(err);
    }
  },

  logout(req, res) {
    req.session = null;
    res.json({ success: true });
  },

  me(req, res) {
    if (!req.user) {
      return res.status(401).json({ error: 'Ej inloggad' });
    }
    res.json({ user: req.user });
  },
};

module.exports = authController;
