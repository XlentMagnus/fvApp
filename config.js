require('dotenv').config();

// Task times are stored as Swedish local time. Vercel (and Turso) run in UTC, and TZ
// can't be set as an env var there, so pin the process time zone here – before any Date is used.
process.env.TZ = process.env.APP_TIMEZONE || 'Europe/Stockholm';

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
  // libSQL URL: Turso in production (libsql://...), a local file in development.
  databaseUrl: process.env.DATABASE_URL || `file:${process.env.DB_PATH || 'db/fv_app.db'}`,
  databaseAuthToken: process.env.DATABASE_AUTH_TOKEN || '',
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  cronSecret: process.env.CRON_SECRET || '',
  isVercel: !!process.env.VERCEL,
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
  // On Vercel Hobby, cron runs once a day: every run sends reminders for sessions in the
  // next 30 h, so each session gets its reminder roughly the day before.
  reminderHoursBefore: parseInt(process.env.REMINDER_HOURS_BEFORE, 10) || (process.env.VERCEL ? 30 : 24),
  reminderSchedule: process.env.REMINDER_SCHEDULE || (process.env.VERCEL ? 'daily' : 'continuous'),
};
module.exports.reminderDescription = module.exports.reminderSchedule === 'daily'
  ? 'dagen innan'
  : `ungefär ${module.exports.reminderHoursBefore} timmar före`;
