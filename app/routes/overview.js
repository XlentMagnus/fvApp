/**
 * Admin staffing overview: every session in a period with its spots and names,
 * plus each active person's load in the period. One request, few queries.
 */
const { Router } = require('express');
const db = require('../../db/connection');
const taskRepository = require('../repositories/taskRepository');
const assignmentRepository = require('../repositories/assignmentRepository');
const { buildSpots } = require('../services/skoterRule');
const { requireAdmin } = require('../middleware/auth');

const router = Router();
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { from, to } = req.query;
    if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '') || to < from) {
      return res.status(400).json({ error: 'Ange from och to (ÅÅÅÅ-MM-DD)' });
    }
    if ((new Date(to) - new Date(from)) / 86400000 > 370) return res.status(400).json({ error: 'Högst ett år åt gången' });

    const tasks = await taskRepository.findByDateRange(from, to);
    const byTask = await assignmentRepository.findByTasks(tasks.map(t => t.id));
    const users = await db.all('SELECT id, name, skoterkort, kan_kiosk, snolaggning FROM users WHERE active = 1 ORDER BY name');
    const load = new Map(users.map(u => [u.id, 0]));

    const now = db.nowLocal().slice(0, 16);
    const out = tasks.map(t => {
      const list = byTask.get(t.id) || [];
      const active = list.filter(a => a.status !== 'declined');
      if (t.status !== 'cancelled') for (const a of active) if (load.has(a.user_id)) load.set(a.user_id, load.get(a.user_id) + 1);
      const spots = t.slots > 0 ? buildSpots(t, active) : active.map(a => ({ skoter: false, assignment: a }));
      const filled = active.length;
      const driverMissing = (t.skoterkort_slots || 0) > 0 && active.filter(a => a.user_skoterkort).length < t.skoterkort_slots;
      return {
        id: t.id, title: t.title, location: t.location, status: t.status,
        start_datetime: t.start_datetime, end_datetime: t.end_datetime,
        category_id: t.category_id, category_name: t.category_name, category_color: t.category_color,
        slots: t.slots, skoterkort_slots: t.skoterkort_slots || 0,
        filled, missing: t.slots > 0 ? Math.max(0, t.slots - filled) : 0,
        overbooked: t.slots > 0 && filled > t.slots,
        driver_missing: driverMissing,
        past: t.start_datetime < now,
        declined: list.filter(a => a.status === 'declined').map(a => a.user_name),
        spots: spots.map(s => ({
          skoter: !!s.skoter, extra: !!s.extra,
          user_id: s.assignment?.user_id ?? null,
          user_name: s.assignment?.user_name ?? null,
          status: s.assignment?.status ?? null,
          has_skoterkort: !!s.assignment?.user_skoterkort,
        })),
      };
    });

    res.json({
      from, to,
      tasks: out,
      people: users.map(u => ({ id: u.id, name: u.name, skoterkort: !!u.skoterkort, kan_kiosk: !!u.kan_kiosk, count: load.get(u.id) })),
    });
  } catch (err) { next(err); }
});

module.exports = router;
