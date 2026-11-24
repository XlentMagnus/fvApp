/**
 * Automatic distribution of open shift slots to members.
 *
 * Rules
 *  - Skills: every spot needs the skill set on the task's category
 *    (categories.required_skill: kan_kiosk | skoterkort | snolaggning), and
 *    `skoterkort_slots` of the task's spots additionally need skoterkort
 *    (e.g. Liftvärd: 2 spots, 1 of them for a skoterkort holder).
 *  - Never double-book: no overlapping times, and (optionally) max one shift per day.
 *  - Never re-add someone already on the task (including people who declined it).
 *  - Fairness: the hardest-to-fill slots are handled first; each slot goes to the
 *    eligible person with the fewest shifts in the chosen period (ties: fewest shifts
 *    overall, then name), so the load evens out.
 *
 * preview() only computes a proposal. apply() re-validates every proposed pair
 * against the current database inside one transaction before saving it.
 */
const db = require('../../db/connection');
const auditRepository = require('../repositories/auditRepository');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const SKILL_LABELS = { kan_kiosk: 'kiosk', skoterkort: 'skoterkort', snolaggning: 'snöläggning' };
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

function pad(n) { return String(n).padStart(2, '0'); }
function localNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function validateRange(from, to) {
  if (!DATE_RE.test(from || '') || !DATE_RE.test(to || '')) throw httpError(400, 'Ange från- och till-datum (ÅÅÅÅ-MM-DD)');
  if (to < from) throw httpError(400, 'Till-datum måste vara efter från-datum');
  const days = (new Date(to) - new Date(from)) / 86400000;
  if (days > MAX_RANGE_DAYS) throw httpError(400, `Perioden får vara högst ${MAX_RANGE_DAYS} dagar`);
}

function requiredSkills(task, needsSkoter = false) {
  const skills = new Set();
  if (needsSkoter) skills.add('skoterkort');
  if (task.required_skill) skills.add(task.required_skill);
  return [...skills];
}

function hasSkill(user, skill) {
  return skill === 'snolaggning' ? Number(user.snolaggning) > 0 : !!user[skill];
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < (bEnd || bStart) && bStart < (aEnd || aStart);
}

/** Loads everything needed for planning from the database. */
function loadState({ from, to, userIds }) {
  const toEnd = `${to} 23:59:59`;

  const tasks = db.prepare(`
    SELECT t.id, t.title, t.location, t.start_datetime, t.end_datetime, t.slots, t.status,
           t.skoterkort_slots, c.required_skill, c.name AS category_name, c.color AS category_color
    FROM tasks t
    LEFT JOIN categories c ON c.id = t.category_id
    WHERE t.start_datetime >= ? AND t.start_datetime <= ?
      AND t.status IN ('planned', 'assigned')
      AND t.start_datetime > ?
    ORDER BY t.start_datetime
  `).all(from, toEnd, localNow());

  let users = db.prepare(`
    SELECT id, name, skoterkort, kan_kiosk, snolaggning FROM users WHERE active = 1 ORDER BY name
  `).all();
  if (Array.isArray(userIds)) {
    const wanted = new Set(userIds.map(Number));
    users = users.filter(u => wanted.has(u.id));
  }

  // All assignments on the tasks in range (any status) – for slot counting, "already on task"
  // and how many skoterkort spots are already covered.
  const onTask = new Map(); // task_id -> Set(user_id)
  const skoterCovered = new Map(); // task_id -> number of assignees with skoterkort
  const taskIds = tasks.map(t => t.id);
  if (taskIds.length) {
    const rows = db.prepare(`
      SELECT ta.task_id, ta.user_id, u.skoterkort FROM task_assignments ta JOIN users u ON u.id = ta.user_id
      WHERE ta.task_id IN (${taskIds.map(() => '?').join(',')})`).all(...taskIds);
    for (const r of rows) {
      if (!onTask.has(r.task_id)) onTask.set(r.task_id, new Set());
      onTask.get(r.task_id).add(r.user_id);
      if (r.skoterkort) skoterCovered.set(r.task_id, (skoterCovered.get(r.task_id) || 0) + 1);
    }
  }

  // Each person's existing (non-declined) bookings, for overlap/day checks and load.
  const bookings = new Map(); // user_id -> [{start,end}]
  const periodLoad = new Map();
  const totalLoad = new Map();
  for (const u of users) { bookings.set(u.id, []); periodLoad.set(u.id, 0); totalLoad.set(u.id, 0); }
  const existing = db.prepare(`
    SELECT ta.user_id, t.start_datetime, t.end_datetime
    FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id
    WHERE ta.status != 'declined' AND t.status != 'cancelled'
  `).all();
  for (const r of existing) {
    if (!bookings.has(r.user_id)) continue;
    bookings.get(r.user_id).push({ start: r.start_datetime, end: r.end_datetime, taskId: null });
    totalLoad.set(r.user_id, totalLoad.get(r.user_id) + 1);
    if (r.start_datetime >= from && r.start_datetime <= toEnd) {
      periodLoad.set(r.user_id, periodLoad.get(r.user_id) + 1);
    }
  }

  const userById = new Map(users.map(u => [u.id, u]));
  return { tasks, users, userById, onTask, skoterCovered, bookings, periodLoad, totalLoad };
}

function makeChecker(state, { maxPerDay }) {
  return {
    /** Why `user` can't take a spot on `task` right now, or null if they can. */
    blocker(user, task, needsSkoter = false) {
      for (const s of requiredSkills(task, needsSkoter)) {
        if (!hasSkill(user, s)) return 'skill';
      }
      if (state.onTask.get(task.id)?.has(user.id)) return 'already';
      const day = task.start_datetime.slice(0, 10);
      for (const b of state.bookings.get(user.id) || []) {
        if (overlaps(task.start_datetime, task.end_datetime, b.start, b.end)) return 'busy';
        if (maxPerDay && b.start.slice(0, 10) === day) return 'busy';
      }
      return null;
    },
    book(user, task) {
      state.bookings.get(user.id).push({ start: task.start_datetime, end: task.end_datetime, taskId: task.id });
      if (!state.onTask.has(task.id)) state.onTask.set(task.id, new Set());
      state.onTask.get(task.id).add(user.id);
      if (user.skoterkort) state.skoterCovered.set(task.id, (state.skoterCovered.get(task.id) || 0) + 1);
      state.periodLoad.set(user.id, state.periodLoad.get(user.id) + 1);
      state.totalLoad.set(user.id, state.totalLoad.get(user.id) + 1);
    },
    unbook(userId, task) {
      const list = state.bookings.get(userId);
      const i = list.findIndex(b => b.taskId === task.id);
      if (i >= 0) list.splice(i, 1);
      state.onTask.get(task.id)?.delete(userId);
      if (state.userById.get(userId)?.skoterkort) state.skoterCovered.set(task.id, (state.skoterCovered.get(task.id) || 1) - 1);
      state.periodLoad.set(userId, state.periodLoad.get(userId) - 1);
      state.totalLoad.set(userId, state.totalLoad.get(userId) - 1);
    },
  };
}

/**
 * Evens out the greedy result. Looks for chains of moves between new
 * assignments, e.g. Amanda's kiosk shift -> Anders, Anders' skoter shift -> Magnus,
 * so the most-loaded person loses one and someone with >= 2 fewer gains one,
 * while everyone in between keeps the same count. Repeats until no chain exists.
 */
function rebalance(state, checker, assignments, { maxDepth = 4, maxRounds = 500 } = {}) {
  const userById = new Map(state.users.map(u => [u.id, u]));
  const load = id => state.periodLoad.get(id);

  for (let round = 0; round < maxRounds; round++) {
    const byLoad = [...state.users].sort((a, b) => load(b.id) - load(a.id) || a.name.localeCompare(b.name, 'sv'));
    let improved = false;

    for (const start of byLoad) {
      const target = load(start.id) - 2;
      if (target < 0 || !byLoad.some(u => load(u.id) <= target)) break; // nobody low enough
      // BFS over "person X can hand one of their new shifts to person Y"
      const parent = new Map([[start.id, null]]);
      let frontier = [{ id: start.id, depth: 0 }];
      let found = null;
      while (frontier.length && !found) {
        const next = [];
        for (const { id: x, depth } of frontier) {
          if (depth >= maxDepth) continue;
          for (const a of assignments) {
            if (a.user_id !== x) continue;
            for (const y of state.users) {
              if (parent.has(y.id)) continue;
              if (checker.blocker(y, a.task, a.needsSkoter)) continue;
              parent.set(y.id, { from: x, a });
              if (load(y.id) <= target) { found = y.id; break; }
              next.push({ id: y.id, depth: depth + 1 });
            }
            if (found) break;
          }
          if (found) break;
        }
        frontier = next;
      }
      if (!found) continue;

      // Apply the chain from the receiving end backwards.
      let y = found;
      while (parent.get(y)) {
        const { from, a } = parent.get(y);
        checker.unbook(from, a.task);
        checker.book(userById.get(y), a.task);
        a.user_id = y;
        y = from;
      }
      improved = true;
      break;
    }
    if (!improved) return;
  }
}

const autoAssignService = {
  preview({ from, to, user_ids, max_per_day = true }) {
    validateRange(from, to);
    const state = loadState({ from, to, userIds: user_ids });
    const checker = makeChecker(state, { maxPerDay: !!max_per_day });
    const before = new Map(state.periodLoad);

    // Build one entry per open slot. Tasks with slots = 0 have no defined size – skip them.
    const slots = [];
    let skippedNoSlots = 0;
    for (const task of state.tasks) {
      if (!task.slots) { skippedNoSlots++; continue; }
      const open = task.slots - (state.onTask.get(task.id)?.size || 0);
      if (open <= 0) continue;
      // Spots still reserved for skoterkort holders come first.
      const unmetSkoter = Math.max(0, (task.skoterkort_slots || 0) - (state.skoterCovered.get(task.id) || 0));
      const skoterSpots = Math.min(unmetSkoter, open);
      for (let i = 0; i < open; i++) {
        const needsSkoter = i < skoterSpots;
        const skilled = state.users.filter(u => requiredSkills(task, needsSkoter).every(s => hasSkill(u, s))).length;
        slots.push({ task, needsSkoter, skilled });
      }
    }

    // Hardest to fill first (fewest people with the right skills), then chronological.
    slots.sort((a, b) => a.skilled - b.skilled || a.task.start_datetime.localeCompare(b.task.start_datetime));

    const assignments = [];
    const unfilled = new Map(); // task_id -> {task, missing, reason}
    for (const { task, needsSkoter } of slots) {
      const reasons = new Set();
      let best = null;
      for (const u of state.users) {
        const why = checker.blocker(u, task, needsSkoter);
        if (why) { reasons.add(why); continue; }
        if (!best
          || state.periodLoad.get(u.id) < state.periodLoad.get(best.id)
          || (state.periodLoad.get(u.id) === state.periodLoad.get(best.id)
            && (state.totalLoad.get(u.id) < state.totalLoad.get(best.id)
              || (state.totalLoad.get(u.id) === state.totalLoad.get(best.id) && u.name.localeCompare(best.name, 'sv') < 0)))) {
          best = u;
        }
      }
      if (best) {
        checker.book(best, task);
        assignments.push({ task, user_id: best.id, needsSkoter });
      } else {
        const key = `${task.id}:${needsSkoter}`;
        const entry = unfilled.get(key) || { task, needsSkoter, missing: 0, reasons: new Set() };
        entry.missing++;
        reasons.forEach(r => entry.reasons.add(r));
        unfilled.set(key, entry);
      }
    }

    rebalance(state, checker, assignments);

    const userById = new Map(state.users.map(u => [u.id, u]));
    const describeTask = (t, needsSkoter) => ({
      id: t.id, title: t.title, location: t.location, start_datetime: t.start_datetime, end_datetime: t.end_datetime,
      category_name: t.category_name, category_color: t.category_color,
      skills: requiredSkills(t, needsSkoter).map(s => SKILL_LABELS[s]),
    });

    return {
      period: { from, to },
      tasks_in_period: state.tasks.length,
      skipped_no_slots: skippedNoSlots,
      open_slots: slots.length,
      assignments: assignments
        .map(a => ({ task_id: a.task.id, user_id: a.user_id, task: describeTask(a.task, a.needsSkoter), user_name: userById.get(a.user_id).name }))
        .sort((a, b) => a.task.start_datetime.localeCompare(b.task.start_datetime) || a.task.title.localeCompare(b.task.title)),
      unfilled: [...unfilled.values()].map(e => {
        const skills = requiredSkills(e.task, e.needsSkoter).map(s => SKILL_LABELS[s]);
        const anySkilled = state.users.some(u => requiredSkills(e.task, e.needsSkoter).every(s => hasSkill(u, s)));
        return {
          task: describeTask(e.task, e.needsSkoter),
          missing: e.missing,
          reason: !anySkilled
            ? `Ingen av de valda personerna har ${skills.join(' + ')}`
            : 'Alla med rätt kompetens är redan upptagna (samma tid/dag eller redan på passet)',
        };
      }).sort((a, b) => a.task.start_datetime.localeCompare(b.task.start_datetime)),
      people: state.users.map(u => ({
        id: u.id,
        name: u.name,
        skills: Object.keys(SKILL_LABELS).filter(s => hasSkill(u, s)).map(s => SKILL_LABELS[s]),
        before: before.get(u.id),
        added: state.periodLoad.get(u.id) - before.get(u.id),
        after: state.periodLoad.get(u.id),
      })).sort((a, b) => b.after - a.after || a.name.localeCompare(b.name, 'sv')),
    };
  },

  apply({ from, to, pairs, max_per_day = true }, actor) {
    validateRange(from, to);
    if (!Array.isArray(pairs) || pairs.length === 0) throw httpError(400, 'Inga tilldelningar att spara');
    if (pairs.length > 5000) throw httpError(400, 'För många tilldelningar på en gång');

    const insert = db.prepare("INSERT INTO task_assignments (task_id, user_id, status) VALUES (?, ?, 'assigned')");
    const markAssigned = db.prepare("UPDATE tasks SET status = 'assigned', updated_at = datetime('now') WHERE id = ? AND status = 'planned'");

    return db.transaction(() => {
      // Fresh state: everyone, so validation sees the database as it is now.
      const state = loadState({ from, to });
      const checker = makeChecker(state, { maxPerDay: !!max_per_day });
      const taskById = new Map(state.tasks.map(t => [t.id, t]));
      const userById = new Map(state.users.map(u => [u.id, u]));

      let applied = 0;
      const skipped = [];
      // Skoterkort holders first, so they fill the reserved spots before anyone else.
      const ordered = [...pairs].sort((a, b) => (userById.get(Number(b.user_id))?.skoterkort ? 1 : 0) - (userById.get(Number(a.user_id))?.skoterkort ? 1 : 0));
      for (const p of ordered) {
        const task = taskById.get(Number(p.task_id));
        const user = userById.get(Number(p.user_id));
        if (!task || !user) { skipped.push({ ...p, reason: 'Passet eller personen finns inte längre i perioden' }); continue; }
        if (task.slots > 0 && (state.onTask.get(task.id)?.size || 0) >= task.slots) {
          skipped.push({ ...p, reason: 'Passet har blivit fullt' }); continue;
        }
        const why = checker.blocker(user, task);
        if (why) { skipped.push({ ...p, reason: why === 'skill' ? 'Saknar kompetens' : 'Upptagen' }); continue; }
        if (!user.skoterkort) {
          const open = task.slots > 0 ? task.slots - (state.onTask.get(task.id)?.size || 0) : Infinity;
          const unmet = Math.max(0, (task.skoterkort_slots || 0) - (state.skoterCovered.get(task.id) || 0));
          if (open <= unmet) { skipped.push({ ...p, reason: 'Platsen kräver skoterkort' }); continue; }
        }

        insert.run(task.id, user.id);
        markAssigned.run(task.id);
        checker.book(user, task);
        auditRepository.log({ actorKind: 'admin', actor, action: 'assign', task, target: user, details: 'Automatisk fördelning' });
        applied++;
      }
      return { applied, skipped };
    })();
  },
};

module.exports = autoAssignService;
