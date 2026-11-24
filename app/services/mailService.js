/**
 * Sends e-mail via SMTP (nodemailer). If SMTP_HOST isn't configured, e-mails
 * are printed to the console instead, so everything can be tested locally.
 */
const nodemailer = require('nodemailer');
const config = require('../../config');

let transporter = null;

function getTransporter() {
  if (!config.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
      auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    });
  }
  return transporter;
}

const mailService = {
  isConfigured() {
    return !!config.smtp.host;
  },

  async send({ to, subject, text, html }) {
    const t = getTransporter();
    if (!t) {
      // Personal keys are secrets – never write them to the log.
      const safe = text.replace(/([?&]k=)[a-f0-9]{32}/g, '$1***');
      console.log(`[mail:dev] (SMTP ej konfigurerat – skickas inte)\n  Till: ${to}\n  Ämne: ${subject}\n  ${safe.replace(/\n/g, '\n  ')}`);
      return { dev: true };
    }
    return t.sendMail({ from: config.smtp.from, to, subject, text, html });
  },
};

module.exports = mailService;
