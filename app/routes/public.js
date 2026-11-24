/**
 * Public endpoints used by /oversikt.
 *
 * Reading the calendar is open to everyone. Signing up / unregistering
 * requires the member's personal link key (X-Member-Key header), and a
 * member can only ever sign up or unregister themselves.
 */
const { Router } = require('express');
const db = require('../../db/connection');
const config = require('../../config');
const taskRepository = require('../repositories/taskRepository');
const assignmentRepository = require('../repositories/assignmentRepository');
const auditRepository = require('../repositories/auditRepository');
const userRepository = require('../repositories/userRepository');
const icalService = require('../services/icalService');
const reminderService = require('../services/reminderService');
const { loadMember, requireMember } = require('../middleware/auth');
const { skoterStatus } = require('../services/skoterRule');

const router = Router();
router.use(loadMember);

function parseLocal(dt) {
  return dt ? new Date(dt.replace(' ', 'T')) : null;
}

router.get('/calendar', async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) {
      return res.status(400).json({ error: 'from och to krävs' });
    }
    const tasks = await taskRepository.findByDateRange(String(from), String(to));
    const byTask = await assignmentRepository.findByTasks(tasks.map(t => t.id));
    for (const t of tasks) {
      const assignments = byTask.get(t.id);
      t.assigned_names = assignments.map(a => a.user_name);
      if (req.member) t.is_mine = assignments.some(a => a.user_id === req.member.id);
      delete t.created_by;
    }
    res.json(tasks);
  } catch (err) { next(err); }
});

// Who am I? Returns the member behind the personal link plus their upcoming tasks.
router.get('/me', requireMember, async (req, res, next) => {
  try {
    const m = req.member;
    const upcoming = (await assignmentRepository.findByUser(m.id, { upcoming: true })).map(a => ({
      task_id: a.task_id,
      title: a.title,
      location: a.location,
      start_datetime: a.start_datetime,
      end_datetime: a.end_datetime,
      category_color: a.category_color,
      status: a.status,
    }));
    res.json({
      member: {
        id: m.id,
        name: m.name,
        skoterkort: !!m.skoterkort,
        has_email: !!m.email,
        email_masked: maskEmail(m.email),
        email_reminders: !!m.email_reminders,
      },
      upcoming,
      unsignMinHours: config.unsignMinHours,
      contactName: config.contactName,
      reminderHoursBefore: config.reminderHoursBefore,
      reminderDescription: config.reminderDescription,
    });
  } catch (err) { next(err); }
});

function maskEmail(email) {
  if (!email) return null;
  const [user, domain] = String(email).split('@');
  if (!domain) return null;
  const visible = user.length <= 2 ? user.slice(0, 1) : user.slice(0, 2);
  return `${visible}${'•'.repeat(Math.max(2, Math.min(6, user.length - visible.length)))}@${domain}`;
}

// Turn e-mail reminders on/off for the member behind the personal link.
router.post('/me/reminders', requireMember, async (req, res, next) => {
  try {
    const enabled = req.body?.enabled === true;
    const m = req.member;
    if (enabled && !m.email) {
      return res.status(400).json({ error: 'Vi saknar din e-postadress. Kontakta föreningen så lägger de till den.' });
    }
    const updated = await userRepository.setEmailReminders(m.id, enabled);
    await auditRepository.log({ actorKind: 'member', actor: m, action: enabled ? 'reminders_on' : 'reminders_off', target: m });
    if (enabled && !m.email_reminders) {
      // Awaited: on serverless, work left running after the response may be killed.
      // Failures are logged but don't fail the request.
      await reminderService.sendConfirmation(updated).catch(err => console.error('[reminders] Bekräftelse misslyckades:', err.message));
      // A session starting soon should get its reminder right away.
      await reminderService.sendDueReminders().catch(err => console.error('[reminders]', err.message));
    }
    res.json({ success: true, email_reminders: enabled });
  } catch (err) { next(err); }
});

// Personal calendar feed (subscribe in Apple/Google/Outlook). Calendar apps can't
// send headers, so the personal key is part of the URL.
function memberFeedTasks(userId) {
  const since = new Date(Date.now() - 60 * 24 * 3600 * 1000);
  const p = n => String(n).padStart(2, '0');
  return db.all(`
    SELECT t.*, c.name AS category_name
    FROM task_assignments ta
    JOIN tasks t ON t.id = ta.task_id
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE ta.user_id = ? AND ta.status != 'declined' AND t.start_datetime >= ?
    ORDER BY t.start_datetime
  `, userId, `${since.getFullYear()}-${p(since.getMonth() + 1)}-${p(since.getDate())}`);
}

router.get('/ical/:token.ics', async (req, res, next) => {
  try {
    const token = String(req.params.token || '').toLowerCase();
    const member = /^[a-f0-9]{32}$/.test(token) ? await userRepository.findByToken(token) : null;
    if (!member || !member.active) return res.status(404).type('text/plain').send('Kalendern hittades inte');
    const ics = icalService.memberFeed(member, await memberFeedTasks(member.id));
    res.set('Cache-Control', 'no-cache').type('text/calendar; charset=utf-8').send(ics);
  } catch (err) { next(err); }
});

// One task as a downloadable .ics file.
router.get('/tasks/:id(\\d+).ics', async (req, res, next) => {
  try {
    const task = await taskRepository.findById(parseInt(req.params.id, 10));
    if (!task) return res.status(404).type('text/plain').send('Uppgiften hittades inte');
    const safeName = task.title.replace(/[^\p{L}\p{N} _-]/gu, '').trim().replace(/\s+/g, '-') || 'pass';
    res.set('Content-Disposition', `attachment; filename="${encodeURIComponent(safeName)}.ics"; filename*=UTF-8''${encodeURIComponent(safeName)}.ics`);
    res.type('text/calendar; charset=utf-8').send(icalService.single(task));
  } catch (err) { next(err); }
});

router.get('/tasks/:id', async (req, res, next) => {
  try {
    const task = await taskRepository.findById(parseInt(req.params.id, 10));
    if (!task) return res.status(404).json({ error: 'Uppgift hittades inte' });
    const assignments = await assignmentRepository.findByTask(task.id);
    // Only names are public – no phone numbers, e-mails or ids.
    task.assignments = assignments.map(a => ({
      user_name: a.user_name,
      status: a.status,
      is_me: !!req.member && a.user_id === req.member.id,
    }));
    // Only aggregate numbers – which individuals hold a skoterkort isn't public.
    task.skoter = skoterStatus(task, assignments);
    if (task.skoter.open === Infinity) task.skoter.open = null;
    delete task.created_by;
    delete task.creator_name;
    res.json(task);
  } catch (err) { next(err); }
});


router.post('/tasks/:id/signup', requireMember, async (req, res, next) => {
  try {
    const member = req.member;
    const task = await taskRepository.findById(parseInt(req.params.id, 10));
    if (!task) return res.status(404).json({ error: 'Uppgift hittades inte' });
    if (task.status === 'cancelled' || task.status === 'done') {
      return res.status(400).json({ error: 'Uppgiften är avslutad eller inställd' });
    }
    const start = parseLocal(task.start_datetime);
    if (start && start < new Date()) {
      return res.status(400).json({ error: 'Passet har redan börjat' });
    }

    const current = await assignmentRepository.findByTask(task.id);
    if (current.some(a => a.user_id === member.id)) return res.status(400).json({ error: 'Du är redan anmäld till detta pass' });

    // Skoterkort is a soft requirement: someone without it who would take a spot
    // reserved for a skoterkort holder must explicitly confirm.
    const skoter = skoterStatus(task, current);
    const takesSkoterSpot = !member.skoterkort && skoter.unmet > 0 && !skoter.openForAnyone;
    if (takesSkoterSpot && req.body?.confirm_skoterkort !== true) {
      return res.status(409).json({
        error: skoter.required >= (task.slots || 1)
          ? 'Det här passet kräver skoterkort, och enligt våra uppgifter har du inte skoterkort. Är du säker på att du kan bemanna det?'
          : 'Den lediga platsen är reserverad för någon med skoterkort, och enligt våra uppgifter har du inte skoterkort. Är du säker på att du kan ta den?',
        code: 'SKOTERKORT_CONFIRM',
      });
    }

    // Check-and-insert in one statement, so two people can't take the last spot at once.
    const assignment = await assignmentRepository.createIfSpace(task.id, member.id);
    if (!assignment) return res.status(400).json({ error: 'Alla platser är fyllda' });
    if (task.status === 'planned') await taskRepository.update(task.id, { status: 'assigned' });
    await auditRepository.log({
      actorKind: 'member', actor: member, action: 'signup', task, target: member,
      details: takesSkoterSpot ? 'Tog skoterkortsplats utan skoterkort (bekräftat)' : null,
    });

    res.json({ success: true, assignment: { id: assignment.id, status: assignment.status } });
  } catch (err) { next(err); }
});

router.post('/tasks/:id/unsign', requireMember, async (req, res, next) => {
  try {
    const member = req.member;
    const task = await taskRepository.findById(parseInt(req.params.id, 10));
    if (!task) return res.status(404).json({ error: 'Uppgift hittades inte' });

    const start = parseLocal(task.start_datetime);
    if (start) {
      const hoursLeft = (start - new Date()) / (1000 * 60 * 60);
      if (hoursLeft < 0) {
        return res.status(400).json({ error: 'Passet har redan börjat – du kan inte avanmäla dig.' });
      }
      if (hoursLeft < config.unsignMinHours) {
        return res.status(400).json({
          error: `Du kan inte avanmäla dig med så här kort varsel! Kontakta ${config.contactName} och säkerställ ersättare!`,
          code: 'TOO_LATE',
        });
      }
    }

    const result = await assignmentRepository.removeByTaskAndUser(task.id, member.id);
    if (result.changes === 0) {
      return res.status(400).json({ error: 'Du är inte anmäld till detta pass' });
    }
    await auditRepository.log({ actorKind: 'member', actor: member, action: 'unsign', task, target: member });

    const remaining = await assignmentRepository.findByTask(task.id);
    if (remaining.length === 0 && task.status === 'assigned') {
      await taskRepository.update(task.id, { status: 'planned' });
    }

    res.json({ success: true });
  } catch (err) { next(err); }
});

router.get('/stats', async (req, res, next) => {
  try {
    res.json(await taskRepository.getStats());
  } catch (err) { next(err); }
});

module.exports = router;
