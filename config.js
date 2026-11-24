require('dotenv').config();

// Task times are stored as Swedish local time. Vercel (and Turso) run in UTC, and TZ
// can't be set as an env var there, so pin the process time zone here – before any Date is used.
process.env.TZ = process.env.APP_TIMEZONE || 'Europe/Stockholm';

const DEFAULT_SECRET = 'dev-secret-change-me';
const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const sessionSecret = process.env.SESSION_SECRET || DEFAULT_SECRET;

const isVercel = !!process.env.VERCEL;
// Turso's Vercel integration names the variables TURSO_*; accept both.
const databaseUrlEnv = process.env.DATABASE_URL || process.env.TURSO_DATABASE_URL || '';
const databaseAuthToken = process.env.DATABASE_AUTH_TOKEN || process.env.TURSO_AUTH_TOKEN || '';

// Configuration problems that make the app unsafe or unable to run. Instead of
// crashing at startup (which on Vercel only shows FUNCTION_INVOCATION_FAILED),
// server.js answers every request with a page that lists them.
const problems = [];
if ((isProduction || isVercel) && (sessionSecret === DEFAULT_SECRET || sessionSecret.length < 32)) {
  problems.push('SESSION_SECRET saknas eller är för kort (minst 32 tecken). Generera: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
}
if (isVercel && !/^(libsql|https|wss?):\/\//.test(databaseUrlEnv)) {
  problems.push(databaseUrlEnv
    ? `DATABASE_URL har fel format (${databaseUrlEnv.split(':')[0]}:…) – ska börja med libsql://`
    : 'DATABASE_URL (eller TURSO_DATABASE_URL) saknas – ska vara Turso-adressen, t.ex. libsql://fv-app-<org>.turso.io');
}
if (isVercel && databaseUrlEnv.startsWith('libsql://') && !databaseAuthToken) {
  problems.push('DATABASE_AUTH_TOKEN (eller TURSO_AUTH_TOKEN) saknas – skapa med: turso db tokens create <databas>');
}

module.exports = {
  port: parseInt(process.env.PORT, 10) || 3000,
  sessionSecret,
  nodeEnv,
  isProduction,
  // libSQL URL: Turso in production (libsql://...), a local file in development.
  databaseUrl: databaseUrlEnv || `file:${require('path').resolve(__dirname, process.env.DB_PATH || 'db/fv_app.db')}`,
  databaseAuthToken,
  problems,
  // Vercel Cron sends "Authorization: Bearer <CRON_SECRET>".
  cronSecret: process.env.CRON_SECRET || '',
  isVercel,
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
