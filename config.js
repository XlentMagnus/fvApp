require('dotenv').config();

const DEFAULT_SECRET = 'dev-secret-change-me';
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const sessionSecret = process.env.SESSION_SECRET || DEFAULT_SECRET;

if (isProduction && (sessionSecret === DEFAULT_SECRET || sessionSecret.length < 32)) {
  throw new Error(
    'SESSION_SECRET måste sättas till en lång slumpmässig sträng (minst 32 tecken) i produktion. ' +
    'Generera t.ex. med: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  sessionSecret,
  nodeEnv,
  isProduction,
  dbPath: process.env.DB_PATH || './db/fv_app.db',
  // Set to the number of reverse proxies in front of the app (e.g. 1 behind nginx/Caddy),
  // so client IPs and HTTPS detection work correctly.
  trustProxy: process.env.TRUST_PROXY ? parseInt(process.env.TRUST_PROXY, 10) || process.env.TRUST_PROXY : false,
  // Shown to members who try to unregister less than 24 h before a task starts.
  contactName: process.env.CONTACT_NAME || 'ansvarig i föreningen',
  unsignMinHours: parseInt(process.env.UNSIGN_MIN_HOURS, 10) || 24,

  // Public address of the app, used for links in e-mails and calendar feeds.
  appUrl: (process.env.APP_URL || `http://localhost:${parseInt(process.env.PORT, 10) || 3000}`).replace(/\/$/, ''),
  appName: process.env.APP_NAME || 'FV Alpin – Bemanning',

  // E-mail reminders. Without SMTP_HOST, e-mails are only printed to the console (dev mode).
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT, 10) || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for port 465
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || 'no-reply@localhost',
  },
  reminderHoursBefore: parseInt(process.env.REMINDER_HOURS_BEFORE, 10) || 24,
};
