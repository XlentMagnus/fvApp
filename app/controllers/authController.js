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
        loginLimiter.fail(req);
        return res.status(401).json({ error: 'Felaktig e-post eller lösenord' });
      }
      loginLimiter.reset(req);

      // New session id on login (prevents session fixation).
      req.session.regenerate((err) => {
        if (err) return next(err);
        req.session.userId = user.id;
        req.session.save((err2) => {
          if (err2) return next(err2);
          res.json({ user });
        });
      });
    } catch (err) {
      next(err);
    }
  },

  logout(req, res) {
    req.session.destroy(() => {
      res.clearCookie('fv.sid');
      res.json({ success: true });
    });
  },

  me(req, res) {
    if (!req.user) {
      return res.status(401).json({ error: 'Ej inloggad' });
    }
    res.json({ user: req.user });
  },
};

module.exports = authController;
