/**
 * Runs pending SQL migrations (db/migrations/*.sql) against DATABASE_URL –
 * Turso in production or the local SQLite file by default.
 *
 *   npm run migrate
 *   DATABASE_URL=libsql://... DATABASE_AUTH_TOKEN=... npm run migrate
 */
const fs = require('fs');
const path = require('path');
const db = require('./connection');
const config = require('../config');

// Splits a migration into statements: drops "--" comments, splits on ";".
function statements(sql) {
  return sql
    .split('\n')
    .map(line => line.replace(/--.*$/, ''))
    .join('\n')
    .split(';')
    .map(s => s.trim())
    .filter(Boolean);
}

async function main() {
  console.log(`Running migrations on ${config.databaseUrl.replace(/\/\/.*@/, '//***@')} ...`);

  await db.run(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT DEFAULT (datetime('now'))
    )
  `);

  const dir = path.join(__dirname, 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const applied = new Set((await db.all('SELECT name FROM _migrations')).map(r => r.name));

  for (const file of files) {
    if (applied.has(file)) {
      console.log(`  ✓ ${file} (already applied)`);
      continue;
    }
    const stmts = statements(fs.readFileSync(path.join(dir, file), 'utf8'));
    try {
      // One transaction per file: the whole migration and its record, or nothing.
      await db.batch([...stmts.map(s => [s]), ['INSERT INTO _migrations (name) VALUES (?)', file]]);
    } catch (err) {
      console.error(`  ✗ ${file} failed – rolled back: ${err.message}`);
      process.exit(1);
    }
    console.log(`  ✔ ${file} applied`);
  }

  console.log('Migrations complete.');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
