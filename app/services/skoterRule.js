/**
 * "X of the task's spots require skoterkort".
 *
 * A task has `slots` spots, of which `skoterkort_slots` must be filled by people
 * with skoterkort. People without skoterkort can only take a spot if enough
 * spots remain for the skoterkort requirement to still be met.
 */

/** Normalises the value coming from a form/API (clamped to 0..slots when slots is set). */
function normaliseSkoterSlots(value, slots) {
  let n = parseInt(value, 10);
  if (!Number.isFinite(n) || n < 0) n = 0;
  if (slots > 0 && n > slots) n = slots;
  return n;
}

/**
 * @param {{slots:number, skoterkort_slots:number}} task
 * @param {{user_skoterkort:number|boolean}[]} assignments  everyone on the task
 */
function skoterStatus(task, assignments) {
  const required = task.skoterkort_slots || 0;
  const covered = assignments.filter(a => a.user_skoterkort).length;
  const unmet = Math.max(0, required - covered);
  const open = task.slots > 0 ? task.slots - assignments.length : Infinity;
  return {
    required,
    covered: Math.min(covered, required),
    unmet,
    open,
    // Can someone WITHOUT skoterkort take a spot without blocking the requirement?
    openForAnyone: open > unmet,
  };
}

/**
 * Lays the task's spots out one by one: the first `skoterkort_slots` spots are
 * "Skoterförare" spots and are filled with skoterkort holders first; the rest are
 * ordinary spots. People beyond the number of spots end up as extra spots.
 * @returns {{ skoter: boolean, extra?: boolean, assignment: object|null }[]}
 */
function buildSpots(task, assignments) {
  const required = task.skoterkort_slots || 0;
  const total = Math.max(task.slots || 0, assignments.length);
  const ordered = [...assignments].sort((a, b) => a.id - b.id);
  const drivers = ordered.filter(a => a.user_skoterkort).slice(0, required);
  const rest = ordered.filter(a => !drivers.includes(a));
  const spots = [];
  for (let i = 0; i < total; i++) {
    if (i < required) spots.push({ skoter: true, assignment: drivers[i] || null });
    else spots.push({ skoter: false, extra: task.slots > 0 && i >= task.slots, assignment: null });
  }
  // People who aren't drivers: ordinary spots first, then any unfilled driver spot.
  const free = spots.filter(s => !s.skoter).concat(spots.filter(s => s.skoter && !s.assignment));
  rest.forEach((a, i) => { if (free[i]) free[i].assignment = a; });
  return spots;
}

module.exports = { normaliseSkoterSlots, skoterStatus, buildSpots };
