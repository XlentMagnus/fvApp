/**
 * Slår ihop alla Liftvärd-pass ("Liftvärd 1 / Skoterförare", "Liftvärd 2", även dubbletter)
 * till ETT pass "Liftvärd" per tidpunkt: 2 platser, varav 1 kräver skoterkort.
 * Mallarna slås ihop på samma sätt.
 *
 *   node db/scripts/merge-lift-tasks.js                    # torrkörning, lokal databas
 *   node db/scripts/merge-lift-tasks.js --remote           # torrkörning mot Turso (.env.development.local)
 *   ... --apply                                            # genomför (backup först)
 *
 * Anmälningar flyttas till det behållna passet (samma person bara en gång). Har fler än
 * 2 personer anmält sig till samma tid behålls alla – passet visas då som överfullt så att
 * admin kan välja vem som ska bort. Hela ändringen körs i en transaktion.
 */
const fs = require('fs');
const path = require('path');
if (process.argv.includes('--remote')) {
  require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.development.local'), override: true });
  if (!process.env.TURSO_DATABASE_URL && !process.env.DATABASE_URL) {
    console.error('Hittar ingen TURSO_DATABASE_URL. Kör först: vercel env pull .env.development.local');
    process.exit(1);
  }
}
const db = require('../connection');
const config = require('../../config');

const OLD_TITLES = ['Liftvärd 1 / Skoterförare', 'Liftvärd 2'];
const NEW_TITLE = 'Liftvärd';
const SLOTS = 2;
const SKOTER_SLOTS = 1;
const APPLY = process.argv.includes('--apply');
const norm = s => String(s || '').trim();
const isLift = t => OLD_TITLES.includes(norm(t)) || norm(t) === NEW_TITLE;

async function main() {
  const tasks = (await db.all('SELECT * FROM tasks ORDER BY id')).filter(t => isLift(t.title));
  const ids = tasks.map(t => t.id);
  const assignments = ids.length
    ? await db.all(`SELECT ta.*, u.name AS user_name, u.skoterkort FROM task_assignments ta JOIN users u ON u.id = ta.user_id
                    WHERE ta.task_id IN (${ids.map(() => '?').join(',')}) ORDER BY ta.id`, ...ids)
    : [];
  const byTask = new Map(ids.map(id => [id, []]));
  for (const a of assignments) byTask.get(a.task_id).push(a);

  // Group by time
  const groups = new Map();
  for (const t of tasks) {
    const key = `${t.start_datetime}|${t.end_datetime}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(t);
  }

  const plan = [];
  for (const [key, list] of groups) {
    // Keep the "Liftvärd 1 / Skoterförare" (or already merged) session with most sign-ups.
    const score = t => (norm(t.title) === OLD_TITLES[1] ? 0 : 1000) + byTask.get(t.id).length;
    const keep = [...list].sort((a, b) => score(b) - score(a) || a.id - b.id)[0];
    const others = list.filter(t => t.id !== keep.id);
    const seen = new Set(byTask.get(keep.id).map(a => a.user_id));
    const move = [];
    const dupes = [];
    for (const o of others) for (const a of byTask.get(o.id)) (seen.has(a.user_id) ? dupes : (seen.add(a.user_id), move)).push(a);
    const people = [...byTask.get(keep.id), ...move];
    plan.push({ key, keep, others, move, dupes, people, alreadyDone: others.length === 0 && norm(keep.title) === NEW_TITLE && keep.slots === SLOTS });
  }

  const todo = plan.filter(p => !p.alreadyDone);
  const overfull = todo.filter(p => p.people.length > SLOTS);
  const noDriver = todo.filter(p => p.people.length >= SLOTS && !p.people.some(a => a.skoterkort));

  const templates = (await db.all('SELECT * FROM task_templates ORDER BY id')).filter(t => isLift(t.title));
  const tGroups = new Map();
  for (const t of templates) {
    const key = `${t.days}|${t.start_time}|${t.end_time}`;
    if (!tGroups.has(key)) tGroups.set(key, []);
    tGroups.get(key).push(t);
  }

  console.log(`\n${APPLY ? 'GENOMFÖR' : 'TORRKÖRNING (inget ändras – lägg till --apply för att genomföra)'}`);
  console.log(`Databas: ${config.databaseUrl.replace(/^(\w+:\/\/[^/?]+).*/, '$1')}\n`);
  console.log(`Pass:     ${tasks.length} Liftvärd-pass vid ${groups.size} tider → ${groups.size} pass "${NEW_TITLE}" (${SLOTS} platser, varav ${SKOTER_SLOTS} med skoterkort)`);
  console.log(`          ${todo.reduce((s, p) => s + p.others.length, 0)} pass tas bort (dubbletter + "Liftvärd 2")`);
  console.log(`          ${todo.reduce((s, p) => s + p.move.length, 0)} anmälningar flyttas, ${todo.reduce((s, p) => s + p.dupes.length, 0)} dubbelanmälningar (samma person) tas bort`);
  if (plan.length - todo.length) console.log(`          ${plan.length - todo.length} tider är redan sammanslagna`);
  if (overfull.length) {
    console.log(`\n⚠️  ${overfull.length} tider får fler än ${SLOTS} anmälda (alla behålls – admin väljer vem som ska bort):`);
    for (const p of overfull.slice(0, 15)) console.log(`   ${p.keep.start_datetime}: ${p.people.map(a => a.user_name + (a.skoterkort ? ' 🛷' : '')).join(', ')}`);
    if (overfull.length > 15) console.log(`   … och ${overfull.length - 15} till`);
  }
  if (noDriver.length) {
    console.log(`\n⚠️  ${noDriver.length} tider är fullbokade men saknar någon med skoterkort:`);
    for (const p of noDriver.slice(0, 10)) console.log(`   ${p.keep.start_datetime}: ${p.people.map(a => a.user_name).join(', ')}`);
  }
  console.log(`\nMallar:   ${templates.length} Liftvärd-mallar → ${tGroups.size}: ${[...tGroups.values()].map(l => l.map(t => `"${norm(t.name)}"`).join(' + ')).join('  |  ')}`);

  if (!APPLY) return;

  // Backup
  const dir = path.join(__dirname, '..', 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backup = path.join(dir, `before-lift-merge-${stamp}.json`);
  const dump = {};
  for (const t of ['tasks', 'task_assignments', 'task_templates', 'audit_log']) dump[t] = await db.all(`SELECT * FROM ${t}`);
  fs.writeFileSync(backup, JSON.stringify(dump));
  console.log(`\nBackup: ${backup}`);

  const stmts = [];
  for (const p of todo) {
    const status = p.people.length ? 'assigned' : (['done', 'cancelled'].includes(p.keep.status) ? p.keep.status : 'planned');
    const description = p.keep.description || p.others.map(o => o.description).find(Boolean) || null;
    stmts.push([`UPDATE tasks SET title = ?, slots = ?, skoterkort_slots = ?, requires_skoterkort = 1, description = ?,
                 status = CASE WHEN status IN ('done','cancelled') THEN status ELSE ? END, updated_at = datetime('now') WHERE id = ?`,
      NEW_TITLE, SLOTS, SKOTER_SLOTS, description, status, p.keep.id]);
    for (const a of p.move) stmts.push(['UPDATE task_assignments SET task_id = ? WHERE id = ?', p.keep.id, a.id]);
    for (const a of p.dupes) stmts.push(['DELETE FROM task_assignments WHERE id = ?', a.id]);
    for (const o of p.others) {
      stmts.push(['UPDATE audit_log SET task_id = ? WHERE task_id = ?', p.keep.id, o.id]);
      stmts.push(['DELETE FROM task_assignments WHERE task_id = ?', o.id]);
      stmts.push(['DELETE FROM tasks WHERE id = ?', o.id]);
    }
  }
  for (const list of tGroups.values()) {
    const keep = [...list].sort((a, b) => (norm(a.title) === OLD_TITLES[1]) - (norm(b.title) === OLD_TITLES[1]) || a.id - b.id)[0];
    const name = norm(keep.name).replace(OLD_TITLES[0], NEW_TITLE).replace(OLD_TITLES[1], NEW_TITLE);
    const category = keep.category_id || list.map(t => t.category_id).find(Boolean) || null;
    stmts.push([`UPDATE task_templates SET name = ?, title = ?, slots = ?, skoterkort_slots = ?, requires_skoterkort = 1,
                 category_id = ?, updated_at = datetime('now') WHERE id = ?`, name, NEW_TITLE, SLOTS, SKOTER_SLOTS, category, keep.id]);
    for (const t of list) if (t.id !== keep.id) stmts.push(['DELETE FROM task_templates WHERE id = ?', t.id]);
  }
  stmts.push([`INSERT INTO audit_log (created_at, actor_kind, actor_name, action, details) VALUES (?, 'system', 'Sammanslagning', 'task_merge', ?)`,
    db.nowLocal(), `Liftvärd: ${tasks.length} pass → ${groups.size}`]);

  await db.batch(stmts);

  // Verify
  const left = (await db.all('SELECT title, slots, skoterkort_slots FROM tasks')).filter(t => isLift(t.title));
  const bad = left.filter(t => norm(t.title) !== NEW_TITLE || t.slots !== SLOTS || t.skoterkort_slots !== SKOTER_SLOTS);
  console.log(`Klart! ${left.length} Liftvärd-pass${bad.length ? `, ${bad.length} avviker – kontrollera!` : ', alla med 2 platser varav 1 skoterkort ✓'}`);
}

main().then(() => process.exit(0)).catch(err => { console.error('Misslyckades – inget ändrat:', err.message); process.exit(1); });
