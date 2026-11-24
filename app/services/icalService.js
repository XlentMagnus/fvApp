/**
 * Builds iCalendar (.ics) files – works with Apple Calendar, Google Calendar and Outlook.
 * Task times are stored as Swedish local time, so events use TZID=Europe/Stockholm.
 */
const config = require('../../config');

const TZID = 'Europe/Stockholm';
const VTIMEZONE = [
  'BEGIN:VTIMEZONE',
  `TZID:${TZID}`,
  'BEGIN:DAYLIGHT',
  'TZOFFSETFROM:+0100',
  'TZOFFSETTO:+0200',
  'TZNAME:CEST',
  'DTSTART:19700329T020000',
  'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU',
  'END:DAYLIGHT',
  'BEGIN:STANDARD',
  'TZOFFSETFROM:+0200',
  'TZOFFSETTO:+0100',
  'TZNAME:CET',
  'DTSTART:19701025T030000',
  'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU',
  'END:STANDARD',
  'END:VTIMEZONE',
];

function escapeText(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

// RFC 5545: lines longer than 75 octets must be folded (continuation lines start with a space).
function fold(line) {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;
  const parts = [];
  let current = '';
  let currentLen = 0;
  for (const ch of line) {
    const len = Buffer.byteLength(ch, 'utf8');
    const limit = parts.length === 0 ? 75 : 74; // continuation lines carry a leading space
    if (currentLen + len > limit) {
      parts.push(current);
      current = '';
      currentLen = 0;
    }
    current += ch;
    currentLen += len;
  }
  parts.push(current);
  return parts.join('\r\n ');
}

// "2026-11-25 20:00" -> "20261125T200000"
function localStamp(dt) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(dt || '');
  if (!m) return null;
  return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6] || '00'}`;
}

function utcStamp(d = new Date()) {
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

function host() {
  try { return new URL(config.appUrl).hostname; } catch { return 'fv-app'; }
}

function eventLines(task, { uidSuffix = '', url } = {}) {
  const start = localStamp(task.start_datetime);
  const end = localStamp(task.end_datetime) || start;
  if (!start) return [];
  const description = [task.description, url ? `Mer info och avanmälan: ${url}` : null].filter(Boolean).join('\n\n');
  return [
    'BEGIN:VEVENT',
    `UID:fv-task-${task.id}${uidSuffix}@${host()}`,
    `DTSTAMP:${utcStamp()}`,
    `DTSTART;TZID=${TZID}:${start}`,
    `DTEND;TZID=${TZID}:${end}`,
    `SUMMARY:${escapeText(task.title)}`,
    task.location ? `LOCATION:${escapeText(task.location)}` : null,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    url ? `URL:${url}` : null,
    `STATUS:${task.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    task.category_name ? `CATEGORIES:${escapeText(task.category_name)}` : null,
    'END:VEVENT',
  ].filter(Boolean);
}

function calendar(events, { name, refreshHours } = {}) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//FV App//Bemanning//SV',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    name ? `X-WR-CALNAME:${escapeText(name)}` : null,
    `X-WR-TIMEZONE:${TZID}`,
    refreshHours ? `REFRESH-INTERVAL;VALUE=DURATION:PT${refreshHours}H` : null,
    refreshHours ? `X-PUBLISHED-TTL:PT${refreshHours}H` : null,
    ...VTIMEZONE,
    ...events.flat(),
    'END:VCALENDAR',
  ].filter(Boolean);
  return lines.map(fold).join('\r\n') + '\r\n';
}

module.exports = {
  /** One task as a downloadable .ics file. */
  single(task) {
    return calendar([eventLines(task, { url: `${config.appUrl}/oversikt` })]);
  },

  /** A member's personal, auto-updating feed of the tasks they're signed up for. */
  memberFeed(member, tasks) {
    const events = tasks.map(t => eventLines(t, { uidSuffix: `-u${member.id}`, url: `${config.appUrl}/oversikt` }));
    return calendar(events, { name: `${config.appName} – ${member.name}`, refreshHours: 1 });
  },
};
