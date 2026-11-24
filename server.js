const express = require('express');
const session = require('express-session');
const SessionStore = require('./app/middleware/sessionStore')(session);
const morgan = require('morgan');
const path = require('path');
const config = require('./config');
const routes = require('./app/routes');
const { loadUser } = require('./app/middleware/auth');
const errorHandler = require('./app/middleware/errorHandler');
const reminderService = require('./app/services/reminderService');

const app = express();

if (config.trustProxy) app.set('trust proxy', config.trustProxy);
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

app.use(
  session({
    store: new SessionStore({ dir: path.join(__dirname, 'db'), file: 'sessions.db' }),
    name: 'fv.sid',
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 7 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: config.isProduction,
    },
  })
);

app.use(loadUser);
// HTML/JS/CSS aren't fingerprinted, so make browsers revalidate them on every load
// (cheap thanks to ETag/304) – otherwise users keep running old code after an update.
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

app.listen(config.port, () => {
  console.log(`FV App running on http://localhost:${config.port}`);
  reminderService.start();
});
