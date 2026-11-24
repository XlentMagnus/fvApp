/**
 * Limits failed login attempts per IP and per e-mail. Stored in the database
 * (table login_failures) because serverless instances don't share memory.
 */
const db = require('../../db/connection');

const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

function keysFor(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return [`ip:${req.ip}`, email && `email:${email}`].filter(Boolean);
}

const loginLimiter = {
  async check(req, res, next) {
    try {
      const keys = keysFor(req);
      const now = Date.now();
      const rows = await db.all(
        `SELECT count, reset_at FROM login_failures WHERE key IN (${keys.map(() => '?').join(',')}) AND reset_at > ?`,
        ...keys, now
      );
      const blocked = rows.filter(r => r.count >= MAX_FAILURES);
      if (blocked.length) {
        const wait = Math.max(...blocked.map(r => r.reset_at - now));
        res.set('Retry-After', String(Math.ceil(wait / 1000)));
        return res.status(429).json({ error: `För många misslyckade inloggningar. Försök igen om ${Math.ceil(wait / 60000)} min.` });
      }
      next();
    } catch (err) { next(err); }
  },

  async fail(req) {
    const now = Date.now();
    await db.batch([
      ['DELETE FROM login_failures WHERE reset_at <= ?', now],
      ...keysFor(req).map(k => [
        `INSERT INTO login_failures (key, count, reset_at) VALUES (?, 1, ?)
         ON CONFLICT(key) DO UPDATE SET count = count + 1`,
        k, now + WINDOW_MS,
      ]),
    ]);
  },

  async reset(req) {
    const keys = keysFor(req);
    await db.run(`DELETE FROM login_failures WHERE key IN (${keys.map(() => '?').join(',')})`, ...keys);
  },
};

module.exports = { loginLimiter };
