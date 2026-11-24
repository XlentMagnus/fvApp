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
  setHeaders(res, filePath) {
    if (/\.(html|js|css)$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.use(routes);

const noCache = { headers: { 'Cache-Control': 'no-cache' } };

app.get('/oversikt', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'oversikt.html'), noCache);
});

app.get('*', (req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Endpoint hittades inte' });
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'), noCache);
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
