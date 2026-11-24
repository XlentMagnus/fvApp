/**
 * Slår ihop "Liftvärd 1 / Skoterförare" + "Liftvärd 2" till ett pass "Liftvärd"
 * med 2 platser, varav 1 kräver skoterkort. Gäller både pass och mallar.
 *
 *   node db/scripts/merge-lift-tasks.js           # visar vad som skulle hända (ändrar inget)
 *   node db/scripts/merge-lift-tasks.js --apply   # gör ändringen (tar backup först)
 *
 * Pass paras ihop på samma start- och sluttid. Anmälningar flyttas över till det
 * sammanslagna passet (är någon anmäld till båda behålls en anmälan).
 */
const fs = require('fs');
const path = require('path');
const db = require('../connection');
const config = require('../../config');

const TITLE_WITH_SKOTER = 'Liftvärd 1 / Skoterförare';
const TITLE_OTHER = 'Liftvärd 2';
const NEW_TITLE = 'Liftvärd';
const APPLY = process.argv.includes('--apply');

const norm = s => String(s || '').trim();

const tasksA = db.prepare('SELECT * FROM tasks WHERE trim(title) = ?').all(TITLE_WITH_SKOTER);
const tasksB = db.prepare('SELECT * FROM tasks WHERE trim(title) = ?').all(TITLE_OTHER);
const bByTime = new Map();
for (const b of tasksB) bByTime.set(`${b.start_datetime}|${b.end_datetime}`, b);

const pairs = [];
const loneA = [];
for (const a of tasksA) {
  const key = `${a.start_datetime}|${a.end_datetime}`;
  const b = bByTime.get(key);
  if (b) { pairs.push({ a, b }); bByTime.delete(key); } else loneA.push(a);
}
const loneB = [...bByTime.values()];

const templates = db.prepare('SELECT * FROM task_templates').all();
const tA = templates.filter(t => norm(t.title) === TITLE_WITH_SKOTER);
const tB = templates.filter(t => norm(t.title) === TITLE_OTHER);
const templatePairs = [];
for (const a of tA) {
  const b = tB.find(x => x.days === a.days && x.start_time === a.start_time && x.end_time === a.end_time);
  if (b) templatePairs.push({ a, b });
}

const assignmentsOf = db.prepare(`
  SELECT ta.*, u.name AS user_name FROM task_assignments ta JOIN users u ON u.id = ta.user_id WHERE ta.task_id = ?`);
let moved = 0;
let duplicates = 0;
for (const { a, b } of pairs) {
  const onA = new Set(assignmentsOf.all(a.id).map(x => x.user_id));
  for (const x of assignmentsOf.all(b.id)) (onA.has(x.user_id) ? duplicates++ : moved++);
}

console.log(`\n${APPLY ? 'SLÅR IHOP' : 'TORRKÖRNING (inget ändras – kör med --apply för att genomföra)'}\n`);
console.log(`Pass:   ${pairs.length} par "${TITLE_WITH_SKOTER}" + "${TITLE_OTHER}" → "${NEW_TITLE}" (2 platser, varav 1 med skoterkort)`);
console.log(`        ${moved} anmälningar flyttas över, ${duplicates} dubbletter (samma person på båda) slås ihop`);
if (loneA.length) console.log(`        ${loneA.length} "${TITLE_WITH_SKOTER}" utan matchande "${TITLE_OTHER}" – byter bara namn`);
if (loneB.length) console.log(`        ${loneB.length} "${TITLE_OTHER}" utan matchande "${TITLE_WITH_SKOTER}" – lämnas orörda`);
console.log(`Mallar: ${templatePairs.length} par slås ihop: ${templatePairs.map(p => `"${norm(p.a.name)}" + "${norm(p.b.name)}"`).join(', ') || '–'}`);

if (!APPLY) process.exit(0);

// Backup first
const backupDir = path.join(__dirname, '..', 'backups');
fs.mkdirSync(backupDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const backupFile = path.join(backupDir, `${path.basename(config.dbPath, '.db')}-before-lift-merge-${stamp}.db`);

db.backup(backupFile).then(() => {
  console.log(`\nBackup: ${backupFile}`);

  const updateTask = db.prepare(`
    UPDATE tasks SET title = ?, slots = ?, skoterkort_slots = ?, requires_skoterkort = 1,
      description = COALESCE(description, ?), status = ?, updated_at = datetime('now') WHERE id = ?`);
  const moveAssignment = db.prepare('UPDATE task_assignments SET task_id = ? WHERE id = ?');
  const deleteAssignment = db.prepare('DELETE FROM task_assignments WHERE id = ?');
  const moveAudit = db.prepare('UPDATE audit_log SET task_id = ? WHERE task_id = ?');
  const deleteTask = db.prepare('DELETE FROM tasks WHERE id = ?');
  const renameTask = db.prepare("UPDATE tasks SET title = ?, updated_at = datetime('now') WHERE id = ?");
  const updateTemplate = db.prepare(`
    UPDATE task_templates SET name = ?, title = ?, slots = ?, skoterkort_slots = ?, requires_skoterkort = 1,
      description = COALESCE(description, ?), updated_at = datetime('now') WHERE id = ?`);
  const deleteTemplate = db.prepare('DELETE FROM task_templates WHERE id = ?');

  db.transaction(() => {
    for (const { a, b } of pairs) {
      const slots = (a.slots || 1) + (b.slots || 1);
      const skoter = Math.max(1, a.skoterkort_slots || 0);
      const status = [a.status, b.status].includes('assigned') ? 'assigned'
        : (a.status === b.status ? a.status : a.status);
      updateTask.run(NEW_TITLE, slots, skoter, b.description, status, a.id);
      const onA = new Set(assignmentsOf.all(a.id).map(x => x.user_id));
      for (const x of assignmentsOf.all(b.id)) {
        if (onA.has(x.user_id)) deleteAssignment.run(x.id);
        else { moveAssignment.run(a.id, x.id); onA.add(x.user_id); }
      }
      moveAudit.run(a.id, b.id);
      deleteTask.run(b.id);
    }
    for (const a of loneA) renameTask.run(NEW_TITLE, a.id);
    for (const { a, b } of templatePairs) {
      const name = norm(a.name).replace(TITLE_WITH_SKOTER, NEW_TITLE);
      updateTemplate.run(name, NEW_TITLE, (a.slots || 1) + (b.slots || 1), Math.max(1, a.skoterkort_slots || 0), b.description, a.id);
      deleteTemplate.run(b.id);
    }
  })();

  console.log('Klart!');
  process.exit(0);
}).catch(err => { console.error('Backup misslyckades – inget ändrat:', err.message); process.exit(1); });
