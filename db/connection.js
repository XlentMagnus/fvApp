/**
 * Database access via libSQL – Turso in production, a local SQLite file in development.
 *
 *   DATABASE_URL=libsql://<db>-<org>.turso.io   DATABASE_AUTH_TOKEN=...   (Vercel / Turso)
 *   DATABASE_URL=file:db/fv_app.db                                       (local, default)
 *
 * All calls are async:
 *   await db.get(sql, ...args)   -> first row as a plain object, or undefined
 *   await db.all(sql, ...args)   -> array of plain objects
 *   await db.run(sql, ...args)   -> { changes, lastInsertRowid }
 *   await db.batch([[sql, ...args], ...])  -> runs all statements in ONE transaction
 */
const { createClient } = require('@libsql/client');
const config = require('../config');

const client = createClient({
  url: config.databaseUrl,
  authToken: config.databaseAuthToken || undefined,
});

// libSQL doesn't accept undefined/booleans as arguments.
function normaliseArgs(args) {
  return args.map(a => (a === undefined ? null : typeof a === 'boolean' ? (a ? 1 : 0) : a));
}

function toObjects(result) {
  return result.rows.map(row => {
    const obj = {};
    result.columns.forEach((col, i) => { obj[col] = row[i]; });
    return obj;
  });
}

// Foreign keys are per connection in SQLite; enable them once (no-op if already on).
const ready = client.execute('PRAGMA foreign_keys = ON').catch(() => {});

const db = {
  client,

  async all(sql, ...args) {
    await ready;
    return toObjects(await client.execute({ sql, args: normaliseArgs(args) }));
  },

  async get(sql, ...args) {
    return (await this.all(sql, ...args))[0];
  },

  async run(sql, ...args) {
    await ready;
    const r = await client.execute({ sql, args: normaliseArgs(args) });
    return { changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid) };
  },

  /** Runs the statements in order inside a single write transaction (all or nothing). */
  async batch(statements) {
    await ready;
    if (!statements.length) return [];
    const results = await client.batch(
      statements.map(([sql, ...args]) => ({ sql, args: normaliseArgs(args) })),
      'write'
    );
    return results.map(r => ({ changes: r.rowsAffected, lastInsertRowid: r.lastInsertRowid == null ? null : Number(r.lastInsertRowid), rows: toObjects(r) }));
  },

  /** Local "YYYY-MM-DD HH:MM:SS" in the app's time zone (the database server runs in UTC). */
  nowLocal() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
  },
};

module.exports = db;
