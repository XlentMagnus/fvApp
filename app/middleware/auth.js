const userRepository = require('../repositories/userRepository');

function wantsJson(req) {
  return req.xhr || req.headers.accept?.includes('application/json') || req.path.startsWith('/api/') || req.originalUrl.startsWith('/api/');
}

/**
 * Loads the logged-in user from the database on every request, so that role
 * changes and deactivations take effect immediately instead of when the
 * session expires.
 */
async function loadUser(req, res, next) {
  try {
    req.user = null;
    const userId = req.session?.userId;
    if (userId) {
      const user = await userRepository.findById(userId);
      if (user && user.active) {
        req.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      } else {
        req.session = null; // removed or deactivated: drop the session cookie
      }
    }
    res.locals.user = req.user;
    next();
  } catch (err) { next(err); }
}

function requireAuth(req, res, next) {
  if (!req.user) {
    if (wantsJson(req)) return res.status(401).json({ error: 'Ej inloggad' });
    return res.redirect('/');
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    if (wantsJson(req)) return res.status(401).json({ error: 'Ej inloggad' });
    return res.redirect('/');
  }
  if (req.user.role !== 'admin') {
    if (wantsJson(req)) return res.status(403).json({ error: 'Åtkomst nekad' });
    return res.status(403).send('Åtkomst nekad');
  }
  next();
}

const TOKEN_RE = /^[a-f0-9]{32}$/;

/**
 * Identifies a member from their personal link key (sent by oversikt.html in
 * the X-Member-Key header). Sets req.member when the key is valid.
 */
async function loadMember(req, res, next) {
  try {
    req.member = null;
    const key = String(req.get('X-Member-Key') || '').trim().toLowerCase();
    if (key && TOKEN_RE.test(key)) {
      const member = await userRepository.findByToken(key);
      if (member && member.active) req.member = member;
    }
    next();
  } catch (err) { next(err); }
}

function requireMember(req, res, next) {
  if (!req.member) {
    return res.status(401).json({
      error: 'Använd din personliga länk från föreningen för att anmäla dig.',
      code: 'MEMBER_KEY_REQUIRED',
    });
  }
  next();
}

module.exports = { loadUser, requireAuth, requireAdmin, loadMember, requireMember };
