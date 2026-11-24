const config = require('./config'); // first: pins the time zone before anything uses Date
const express = require('express');
const cookieSession = require('cookie-session');
const morgan = require('morgan');
const path = require('path');
const routes = require('./app/routes');
const { loadUser } = require('./app/middleware/auth');
const errorHandler = require('./app/middleware/errorHandler');
const reminderService = require('./app/services/reminderService');

const app = express();

// Vercel sits behind its own proxy: trust it so req.ip / HTTPS detection work.
if (config.isVercel) app.set('trust proxy', true);
else if (config.trustProxy) app.set('trust proxy', config.trustProxy);
app.disable('x-powered-by');

// Missing/unsafe configuration: refuse to run, but say exactly what's wrong (names only,
// never values) instead of crashing – on Vercel a crash only shows FUNCTION_INVOCATION_FAILED.
if (config.problems.length) {
  console.error('[config] Appen kan inte starta:\n  - ' + config.problems.join('\n  - '));
  app.use((req, res) => {
    const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    if (req.path.startsWith('/api/')) return res.status(503).json({ error: 'Appen är inte konfigurerad', problems: config.problems });
    res.status(503).send(`<!doctype html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
      <title>Konfiguration saknas</title></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:4rem auto;padding:0 1rem;line-height:1.5">
      <h1 style="font-size:1.4rem">⚙️ Appen är inte färdigkonfigurerad</h1>
      <p>Följande miljövariabler behöver sättas (Vercel → Settings → Environment Variables), och sedan behöver projektet deployas om:</p>
      <ul>${config.problems.map(p => `<li style="margin-bottom:.5rem"><code>${esc(p)}</code></li>`).join('')}</ul>
      <p style="color:#666;font-size:.9rem">Se DEPLOY-VERCEL.md i repot för hela guiden.</p></body></html>`);
  });
}

// Personal member links (?k=...) must never leak to other sites via the Referer header.
app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'no-referrer',
  });
  next();
});

// Don't write member keys from URLs into the access log.
morgan.token('safe-url', (req) => req.originalUrl.replace(/([?&]k=)[^&]+/, '$1***').replace(/(\/ical\/)[^/.?]+/, '$1***'));
app.use(morgan(':remote-addr :method :safe-url :status :res[content-length] - :response-time ms'));
app.use(express.json({ limit: '100kb' }));

// Stateless, signed session cookie – works across serverless instances without a session store.
app.use(cookieSession({
  name: 'fv.sid',
  keys: [config.sessionSecret],
  maxAge: 7 * 24 * 60 * 60 * 1000,
  httpOnly: true,
  sameSite: 'lax',
  secure: config.isProduction || config.isVercel,
}));

// Vercel Cron: GET /api/cron/reminders with "Authorization: Bearer <CRON_SECRET>".
app.get('/api/cron/reminders', async (req, res, next) => {
  try {
    if (!config.cronSecret || req.get('Authorization') !== `Bearer ${config.cronSecret}`) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    const sent = await reminderService.sendDueReminders();
    res.json({ sent });
  } catch (err) { next(err); }
});

app.use(loadUser);

// Static files. On Vercel, public/ is served by the CDN (see vercel.json) and this is
// only used locally. HTML/JS/CSS aren't fingerprinted, so browsers must revalidate them.
app.use(express.static(path.join(__dirname, 'public'), {
  index: false,
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.use(routes);

const noCache = { headers: { 'Cache-Control': 'no-cache' } };

// Start page = the public overview. The admin app lives at /admin.
app.get(['/', '/oversikt'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'oversikt.html'), noCache);
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'), noCache);
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint hittades inte' });
  }
  res.redirect('/');
});

app.use(errorHandler);

// Locally: start a server + the 10-minute reminder loop. On Vercel the app is exported
// as a function and reminders are triggered by Vercel Cron instead.
if (require.main === module && !config.isVercel) {
  app.listen(config.port, () => {
    console.log(`FV App running on http://localhost:${config.port}`);
    reminderService.start();
  });
}

module.exports = app;
