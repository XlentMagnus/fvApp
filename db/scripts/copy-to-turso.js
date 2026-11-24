/**
 * Kopierar den lokala databasen (struktur + all data) till Turso.
 *
 *   vercel env pull .env.development.local     # hämtar TURSO_DATABASE_URL + TURSO_AUTH_TOKEN
 *   npm run db:copy-to-turso                   # torrkörning: visar vad som skulle kopieras
 *   npm run db:copy-to-turso -- --apply        # kopierar
 *
 * Källa:  db/fv_app.db (eller SOURCE_DB=sökväg)
 * Mål:    TURSO_DATABASE_URL / DATABASE_URL + token, från miljön eller .env.development.local
 *
 * Vägrar om måldatabasen redan har tabeller med data (lägg till --force för att ändå fortsätta,
 * då hoppas befintliga tabeller över och bara saknade tabeller/rader läggs till).
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.development.local') });
const { createClient } = require('@libsql/client');

const APPLY = process.argv.includes('--apply');
const FORCE = process.argv.includes('--force');
const BATCH = 200;

// Insert order so references always exist first.
const ORDER = ['_migrations', 'users', 'categories', 'tasks', 'task_templates', 'task_assignments', 'audit_log'];
// Internal SQLite table – never copied.
const SKIP = new Set(['sqlite_sequence']);
// Tables whose structure is created but whose rows aren't worth copying.
const SCHEMA_ONLY = new Set(['login_failures']);

const sourcePath = path.resolve(process.env.SOURCE_DB || path.join(__dirname, '..', 'fv_app.db'));
const targetUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL;
const targetToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN;

function rowsOf(result) {
  return result.rows.map(r => result.columns.map((_, i) => r[i]));
}

async function main() {
  if (!fs.existsSync(sourcePath)) throw new Error(`Hittar inte källdatabasen: ${sourcePath}`);
  if (!targetUrl) throw new Error('TURSO_DATABASE_URL saknas. Kör först: vercel env pull .env.development.local');
  if (targetUrl.startsWith('file:') && path.resolve(targetUrl.slice(5)) === sourcePath) throw new Error('Källa och mål är samma fil');

  const source = createClient({ url: `file:${sourcePath}` });
  const target = createClient({ url: targetUrl, authToken: targetToken || undefined });
  const host = targetUrl.replace(/^(\w+:\/\/)([^/?]+).*/, '$1$2');

  const objects = (await source.execute(
    "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'"
  )).rows.map(r => ({ type: r[0], name: r[1], table: r[2], sql: r[3] }));
  const tables = objects.filter(o => o.type === 'table' && !SKIP.has(o.name))
    .sort((a, b) => (ORDER.indexOf(a.name) + 1 || 99) - (ORDER.indexOf(b.name) + 1 || 99));
  const indexes = objects.filter(o => o.type === 'index' && !SKIP.has(o.table));

  const existing = new Set((await target.execute("SELECT name FROM sqlite_master WHERE type = 'table'")).rows.map(r => r[0]));
  let targetHasData = false;
  for (const t of tables) {
    if (existing.has(t.name) && Number((await target.execute(`SELECT COUNT(*) FROM "${t.name}"`)).rows[0][0]) > 0) targetHasData = true;
  }

  console.log(`\nKälla: ${sourcePath}`);
  console.log(`Mål:   ${host}\n`);
  const counts = {};
  for (const t of tables) {
    counts[t.name] = Number((await source.execute(`SELECT COUNT(*) FROM "${t.name}"`)).rows[0][0]);
    console.log(`  ${t.name.padEnd(18)} ${String(counts[t.name]).padStart(6)} rader${existing.has(t.name) ? '  (tabellen finns redan i målet – hoppas över)' : ''}`);
  }

  if (targetHasData && !FORCE) {
    console.error('\nMåldatabasen innehåller redan data – avbryter för att inte skriva över något.');
    console.error('Använd --force för att bara lägga till tabeller som saknas.');
    process.exit(1);
  }
  if (!APPLY) {
    console.log('\nTORRKÖRNING – inget kopierat. Kör med --apply för att kopiera.');
    return;
  }

  for (const t of tables) {
    if (existing.has(t.name)) continue;
    await target.execute(t.sql);
    if (SCHEMA_ONLY.has(t.name)) { console.log(`  ✔ ${t.name}: (bara struktur)`); continue; }
    const data = await source.execute(`SELECT * FROM "${t.name}"`);
    const cols = data.columns.map(c => `"${c}"`).join(', ');
    const marks = data.columns.map(() => '?').join(', ');
    const all = rowsOf(data);
    for (let i = 0; i < all.length; i += BATCH) {
      await target.batch(all.slice(i, i + BATCH).map(args => ({ sql: `INSERT INTO "${t.name}" (${cols}) VALUES (${marks})`, args })), 'write');
    }
    console.log(`  ✔ ${t.name}: ${all.length} rader`);
  }
  for (const ix of indexes) {
    await target.execute(ix.sql.replace(/^CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)/i, 'CREATE $1INDEX IF NOT EXISTS '));
  }

  // Verify
  for (const t of tables) {
    const n = Number((await target.execute(`SELECT COUNT(*) FROM "${t.name}"`)).rows[0][0]);
    if (!existing.has(t.name) && !SCHEMA_ONLY.has(t.name) && n !== counts[t.name]) throw new Error(`Antal rader stämmer inte för ${t.name}: ${n} ≠ ${counts[t.name]}`);
  }
  console.log('\nKlart! Alla rader verifierade. Kör sedan: npm run migrate (med Turso-variablerna) för eventuella nya migreringar.');
}

main().then(() => process.exit(0)).catch(err => { console.error('\nFel:', err.message); process.exit(1); });
