const db = require('./connection');
const fs = require('fs');
const path = require('path');

console.log('Running migrations...');

db.exec(`
  CREATE TABLE IF NOT EXISTS _migrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    applied_at TEXT DEFAULT (datetime('now'))
  );
`);

const migrationsDir = path.join(__dirname, 'migrations');
const files = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort();

const applied = new Set(
  db.prepare('SELECT name FROM _migrations').all().map(r => r.name)
);

// Each migration runs in its own transaction: either the whole file is applied
// and recorded, or nothing is (no half-migrated database on failure).
const applyMigration = db.transaction((file, sql) => {
  db.exec(sql);
  db.prepare('INSERT INTO _migrations (name) VALUES (?)').run(file);
});

for (const file of files) {
  if (applied.has(file)) {
    console.log(`  ✓ ${file} (already applied)`);
    continue;
  }
  const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
  try {
    applyMigration(file, sql);
  } catch (err) {
    console.error(`  ✗ ${file} failed – rolled back: ${err.message}`);
    process.exit(1);
  }
  console.log(`  ✔ ${file} applied`);
}

console.log('Migrations complete.');
process.exit(0);
