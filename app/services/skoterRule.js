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

module.exports = { normaliseSkoterSlots, skoterStatus };
