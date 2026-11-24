/**
 * Minimal in-memory limiter for failed login attempts (single-process app,
 * so no external store needed). Counts failures per IP and per e-mail.
 */
const WINDOW_MS = 15 * 60 * 1000;
const MAX_FAILURES = 10;

const failures = new Map(); // key -> { count, resetAt }

function hit(key) {
  const now = Date.now();
  const entry = failures.get(key);
  if (!entry || entry.resetAt <= now) {
    failures.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function blockedFor(key) {
  const entry = failures.get(key);
  if (!entry) return 0;
  const now = Date.now();
  if (entry.resetAt <= now) { failures.delete(key); return 0; }
  return entry.count >= MAX_FAILURES ? entry.resetAt - now : 0;
}

function keysFor(req) {
  const email = String(req.body?.email || '').trim().toLowerCase();
  return [`ip:${req.ip}`, email && `email:${email}`].filter(Boolean);
}

const loginLimiter = {
  check(req, res, next) {
    const wait = Math.max(...keysFor(req).map(blockedFor), 0);
    if (wait > 0) {
      const minutes = Math.ceil(wait / 60000);
      res.set('Retry-After', String(Math.ceil(wait / 1000)));
      return res.status(429).json({ error: `För många misslyckade inloggningar. Försök igen om ${minutes} min.` });
    }
    next();
  },
  fail(req) { keysFor(req).forEach(hit); },
  reset(req) { keysFor(req).forEach(k => failures.delete(k)); },
};

// Periodically drop expired entries so the map can't grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of failures) if (v.resetAt <= now) failures.delete(k);
}, WINDOW_MS).unref();

module.exports = { loginLimiter };
