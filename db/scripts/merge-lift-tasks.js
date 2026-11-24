/**
 * Slår ihop "Liftvärd 1 / Skoterförare" + "Liftvärd 2" till ett pass "Liftvärd"
 * med 2 platser, varav 1 kräver skoterkort. Gäller både pass och mallar.
 *
 *   node db/scripts/merge-lift-tasks.js           # visar vad som skulle hända (ändrar inget)
 *   node db/scripts/merge-lift-tasks.js --apply   # gör ändringen
 *
 * Lokal databas (file:): en backup sparas i db/backups/ först.
 * Turso: använd Tursos point-in-time-återställning om något behöver backas.
 * Hela sammanslagningen körs i en transaktion – allt eller inget.
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

async function main() {
  const tasksA = await db.all('SELECT * FROM tasks WHERE trim(title) = ?', TITLE_WITH_SKOTER);
  const tasksB = await db.all('SELECT * FROM tasks WHERE trim(title) = ?', TITLE_OTHER);
  const bByTime = new Map(tasksB.map(b => [`${b.start_datetime}|${b.end_datetime}`, b]));

  const pairs = [];
  const loneA = [];
  for (const a of tasksA) {
    const key = `${a.start_datetime}|${a.end_datetime}`;
    const b = bByTime.get(key);
    if (b) { pairs.push({ a, b }); bByTime.delete(key); } else loneA.push(a);
  }
  const loneB = [...bByTime.values()];

  const templates = await db.all('SELECT * FROM task_templates');
  const tA = templates.filter(t => norm(t.title) === TITLE_WITH_SKOTER);
  const tB = templates.filter(t => norm(t.title) === TITLE_OTHER);
  const templatePairs = [];
  for (const a of tA) {
    const b = tB.find(x => x.days === a.days && x.start_time === a.start_time && x.end_time === a.end_time);
    if (b) templatePairs.push({ a, b });
  }

  const taskIds = pairs.flatMap(p => [p.a.id, p.b.id]);
  const assignments = taskIds.length
    ? await db.all(`SELECT * FROM task_assignments WHERE task_id IN (${taskIds.map(() => '?').join(',')})`, ...taskIds)
    : [];
  const byTask = new Map();
  for (const x of assignments) (byTask.get(x.task_id) || byTask.set(x.task_id, []).get(x.task_id)).push(x);

  let moved = 0;
  let duplicates = 0;
  for (const { a, b } of pairs) {
    const onA = new Set((byTask.get(a.id) || []).map(x => x.user_id));
    for (const x of byTask.get(b.id) || []) (onA.has(x.user_id) ? duplicates++ : moved++);
  }

  console.log(`\n${APPLY ? 'SLÅR IHOP' : 'TORRKÖRNING (inget ändras – kör med --apply för att genomföra)'}\n`);
  console.log(`Pass:   ${pairs.length} par "${TITLE_WITH_SKOTER}" + "${TITLE_OTHER}" → "${NEW_TITLE}" (2 platser, varav 1 med skoterkort)`);
  console.log(`        ${moved} anmälningar flyttas över, ${duplicates} dubbletter (samma person på båda) slås ihop`);
  if (loneA.length) console.log(`        ${loneA.length} "${TITLE_WITH_SKOTER}" utan matchande "${TITLE_OTHER}" – byter bara namn`);
  if (loneB.length) console.log(`        ${loneB.length} "${TITLE_OTHER}" utan matchande "${TITLE_WITH_SKOTER}" – lämnas orörda`);
  console.log(`Mallar: ${templatePairs.length} par slås ihop: ${templatePairs.map(p => `"${norm(p.a.name)}" + "${norm(p.b.name)}"`).join(', ') || '–'}`);

  if (!APPLY) return;

  if (config.databaseUrl.startsWith('file:')) {
    const file = path.resolve(config.databaseUrl.slice(5));
    const dir = path.join(__dirname, '..', 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backup = path.join(dir, `${path.basename(file, '.db')}-before-lift-merge-${stamp}.db`);
    await db.client.execute(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    console.log(`\nBackup: ${backup}`);
  } else {
    console.log('\nTurso-databas: ingen filbackup – använd Tursos point-in-time-återställning vid behov.');
  }

  const stmts = [];
  for (const { a, b } of pairs) {
    const slots = (a.slots || 1) + (b.slots || 1);
    const skoter = Math.max(1, a.skoterkort_slots || 0);
    const status = [a.status, b.status].includes('assigned') ? 'assigned' : a.status;
    stmts.push([`UPDATE tasks SET title = ?, slots = ?, skoterkort_slots = ?, requires_skoterkort = 1,
                 description = COALESCE(description, ?), status = ?, updated_at = datetime('now') WHERE id = ?`,
      NEW_TITLE, slots, skoter, b.description, status, a.id]);
    const onA = new Set((byTask.get(a.id) || []).map(x => x.user_id));
    for (const x of byTask.get(b.id) || []) {
      if (onA.has(x.user_id)) stmts.push(['DELETE FROM task_assignments WHERE id = ?', x.id]);
      else { stmts.push(['UPDATE task_assignments SET task_id = ? WHERE id = ?', a.id, x.id]); onA.add(x.user_id); }
    }
    stmts.push(['UPDATE audit_log SET task_id = ? WHERE task_id = ?', a.id, b.id]);
    stmts.push(['DELETE FROM tasks WHERE id = ?', b.id]);
  }
  for (const a of loneA) stmts.push(["UPDATE tasks SET title = ?, updated_at = datetime('now') WHERE id = ?", NEW_TITLE, a.id]);
  for (const { a, b } of templatePairs) {
    stmts.push([`UPDATE task_templates SET name = ?, title = ?, slots = ?, skoterkort_slots = ?, requires_skoterkort = 1,
                 description = COALESCE(description, ?), updated_at = datetime('now') WHERE id = ?`,
      norm(a.name).replace(TITLE_WITH_SKOTER, NEW_TITLE), NEW_TITLE, (a.slots || 1) + (b.slots || 1),
      Math.max(1, a.skoterkort_slots || 0), b.description, a.id]);
    stmts.push(['DELETE FROM task_templates WHERE id = ?', b.id]);
  }

  await db.batch(stmts);
  console.log('Klart!');
}

main().then(() => process.exit(0)).catch(err => { console.error('Misslyckades – inget ändrat:', err.message); process.exit(1); });
