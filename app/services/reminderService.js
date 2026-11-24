/**
 * E-mail reminders for members who have opted in on their personal page.
 * A background job checks every few minutes for sessions starting within
 * REMINDER_HOURS_BEFORE hours and sends one reminder per sign-up.
 */
const db = require('../../db/connection');
const config = require('../../config');
const mailService = require('./mailService');

const CHECK_INTERVAL_MS = 10 * 60 * 1000;

function pad(n) { return String(n).padStart(2, '0'); }
function localStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DAYS = ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'];
const MONTHS = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

function describeWhen(start, end) {
  const s = new Date(start.replace(' ', 'T'));
  const e = end ? new Date(end.replace(' ', 'T')) : null;
  const time = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${DAYS[s.getDay()]} ${s.getDate()} ${MONTHS[s.getMonth()]} kl. ${time(s)}${e ? `–${time(e)}` : ''}`;
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function personalUrl(token) {
  return `${config.appUrl}/oversikt?k=${token}`;
}

function layout(bodyHtml) {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f9fafb;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#111827">
  <div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
    <div style="background:#EAB308;padding:14px 20px;font-weight:700;color:#0a0a0a">${escapeHtml(config.appName)}</div>
    <div style="padding:20px;line-height:1.5">${bodyHtml}</div>
  </div>
  <p style="max-width:520px;margin:12px auto 0;font-size:12px;color:#6b7280">Du får det här mejlet för att du har slagit på mejlpåminnelser. Du kan stänga av dem på din personliga sida.</p>
  </body></html>`;
}

function reminderEmail(row) {
  const when = describeWhen(row.start_datetime, row.end_datetime);
  const url = personalUrl(row.access_token);
  const first = row.user_name.split(' ')[0];
  const subject = `Påminnelse: ${row.title} – ${when}`;
  const text = [
    `Hej ${first}!`,
    '',
    'En påminnelse om att du är anmäld till:',
    '',
    `  ${row.title}`,
    `  ${when}`,
    row.location ? `  Plats: ${row.location}` : null,
    '',
    row.description || null,
    row.description ? '' : null,
    `Anmälan är nu bindande – det går inte längre att avanmäla sig via sidan (mindre än ${config.unsignMinHours} timmar kvar).`,
    `Kan du inte komma? Kontakta ${config.contactName} direkt och se till att det finns en ersättare.`,
    '',
    `Dina pass: ${url}`,
    '',
    'Tack för att du ställer upp!',
  ].filter(l => l !== null).join('\n');
  const html = layout(`
    <p>Hej ${escapeHtml(first)}!</p>
    <p>En påminnelse om att du är anmäld till:</p>
    <div style="border-left:4px solid ${/^#[0-9a-f]{6}$/i.test(row.category_color || '') ? row.category_color : '#EAB308'};background:#f9fafb;padding:12px 14px;border-radius:6px;margin:12px 0">
      <div style="font-weight:600;font-size:16px">${escapeHtml(row.title)}</div>
      <div style="color:#4b5563">🕐 ${escapeHtml(when)}</div>
      ${row.location ? `<div style="color:#4b5563">📍 ${escapeHtml(row.location)}</div>` : ''}
      ${row.description ? `<div style="color:#4b5563;margin-top:6px">${escapeHtml(row.description)}</div>` : ''}
    </div>
    <div style="background:#fef2f2;border:1px solid #fecaca;color:#991b1b;padding:10px 12px;border-radius:6px;font-size:14px;margin:12px 0">
      <strong>🔒 Anmälan är nu bindande.</strong> Det går inte längre att avanmäla sig via sidan (mindre än ${config.unsignMinHours} timmar kvar).
      Kan du inte komma? <strong>Kontakta ${escapeHtml(config.contactName)}</strong> direkt och se till att det finns en ersättare.
    </div>
    <p><a href="${url}" style="display:inline-block;background:#EAB308;color:#0a0a0a;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">Visa mina pass</a></p>
    <p>Tack för att du ställer upp! 🙌</p>`);
  return { subject, text, html };
}

function confirmationEmail(member) {
  const url = personalUrl(member.access_token);
  const first = member.name.split(' ')[0];
  const subject = 'Mejlpåminnelser är påslagna';
  const text = [
    `Hej ${first}!`,
    '',
    `Nu får du en påminnelse via mejl ${config.reminderDescription} varje pass du är anmäld till.`,
    '',
    `Kom ihåg: anmälan är bindande. Du kan avanmäla dig senast ${config.unsignMinHours} timmar före passet – därefter måste du kontakta ${config.contactName} och ordna en ersättare.`,
    '',
    `Du kan stänga av påminnelserna när som helst på din personliga sida: ${url}`,
  ].join('\n');
  const html = layout(`
    <p>Hej ${escapeHtml(first)}!</p>
    <p>Nu får du en påminnelse via mejl <strong>${config.reminderDescription}</strong> varje pass du är anmäld till. ✅</p>
    <p style="background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:10px 12px;border-radius:6px;font-size:14px">⚠️ <strong>Kom ihåg: anmälan är bindande.</strong> Du kan avanmäla dig senast ${config.unsignMinHours} timmar före passet – därefter måste du kontakta ${escapeHtml(config.contactName)} och ordna en ersättare.</p>
    <p><a href="${url}" style="display:inline-block;background:#EAB308;color:#0a0a0a;text-decoration:none;font-weight:600;padding:10px 16px;border-radius:8px">Visa mina pass</a></p>
    <p style="color:#6b7280;font-size:14px">Du kan stänga av påminnelserna när som helst på samma sida.</p>`);
  return { subject, text, html };
}

const FIND_DUE = `
  SELECT ta.id AS assignment_id, u.name AS user_name, u.email, u.access_token,
         t.id AS task_id, t.title, t.description, t.location, t.start_datetime, t.end_datetime,
         c.color AS category_color
  FROM task_assignments ta
  JOIN users u ON u.id = ta.user_id
  JOIN tasks t ON t.id = ta.task_id
  LEFT JOIN categories c ON c.id = t.category_id
  WHERE u.email_reminders = 1 AND u.active = 1 AND u.email IS NOT NULL AND u.email != ''
    AND ta.status != 'declined' AND ta.reminder_sent_at IS NULL
    AND t.status NOT IN ('cancelled', 'done')
    AND t.start_datetime > ? AND t.start_datetime <= ?
  ORDER BY t.start_datetime
`;

let running = false;

const reminderService = {
  async sendDueReminders() {
    if (running) return 0;
    running = true;
    let sent = 0;
    try {
      const now = new Date();
      const until = new Date(now.getTime() + config.reminderHoursBefore * 60 * 60 * 1000);
      for (const row of await db.all(FIND_DUE, localStr(now), localStr(until))) {
        try {
          await mailService.send({ to: row.email, ...reminderEmail(row) });
          await db.run('UPDATE task_assignments SET reminder_sent_at = ? WHERE id = ?', db.nowLocal(), row.assignment_id);
          sent++;
        } catch (err) {
          console.error(`[reminders] Kunde inte skicka till ${row.email}: ${err.message}`);
        }
      }
    } finally {
      running = false;
    }
    if (sent) console.log(`[reminders] Skickade ${sent} påminnelse(r)`);
    return sent;
  },

  sendConfirmation(member) {
    return mailService.send({ to: member.email, ...confirmationEmail(member) });
  },

  start() {
    const tick = () => this.sendDueReminders().catch(err => console.error('[reminders]', err));
    setTimeout(tick, 5000).unref();
    setInterval(tick, CHECK_INTERVAL_MS).unref();
    console.log(`[reminders] Aktiv – kollar var ${CHECK_INTERVAL_MS / 60000}:e minut (${mailService.isConfigured() ? 'SMTP' : 'dev-läge: mejl skrivs till konsolen'})`);
  },
};

module.exports = reminderService;
