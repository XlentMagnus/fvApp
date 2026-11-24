/**
 * express-session store backed by better-sqlite3 (already used by the app),
 * replacing connect-sqlite3 and its heavy, vulnerable sqlite3/node-gyp tree.
 */
const path = require('path');
const Database = require('better-sqlite3');

module.exports = function createStore(session) {
  class SqliteSessionStore extends session.Store {
    constructor({ dir, file = 'sessions.db', cleanupIntervalMs = 60 * 60 * 1000 } = {}) {
      super();
      this.db = new Database(path.join(dir, file));
      this.db.pragma('journal_mode = WAL');
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS sessions (
          sid TEXT PRIMARY KEY,
          expires INTEGER NOT NULL,
          sess TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
      `);
      this.stmts = {
        get: this.db.prepare('SELECT sess, expires FROM sessions WHERE sid = ?'),
        set: this.db.prepare('INSERT INTO sessions (sid, expires, sess) VALUES (?, ?, ?) ON CONFLICT(sid) DO UPDATE SET expires = excluded.expires, sess = excluded.sess'),
        destroy: this.db.prepare('DELETE FROM sessions WHERE sid = ?'),
        touch: this.db.prepare('UPDATE sessions SET expires = ? WHERE sid = ?'),
        cleanup: this.db.prepare('DELETE FROM sessions WHERE expires <= ?'),
      };
      this.stmts.cleanup.run(Date.now());
      setInterval(() => this.stmts.cleanup.run(Date.now()), cleanupIntervalMs).unref();
    }

    static expiry(sess) {
      const exp = sess?.cookie?.expires;
      return exp ? new Date(exp).getTime() : Date.now() + 24 * 60 * 60 * 1000;
    }

    get(sid, cb) {
      try {
        const row = this.stmts.get.get(sid);
        if (!row || row.expires <= Date.now()) return cb(null, null);
        cb(null, JSON.parse(row.sess));
      } catch (err) { cb(err); }
    }

    set(sid, sess, cb) {
      try {
        this.stmts.set.run(sid, SqliteSessionStore.expiry(sess), JSON.stringify(sess));
        cb?.(null);
      } catch (err) { cb?.(err); }
    }

    destroy(sid, cb) {
      try { this.stmts.destroy.run(sid); cb?.(null); } catch (err) { cb?.(err); }
    }

    touch(sid, sess, cb) {
      try { this.stmts.touch.run(SqliteSessionStore.expiry(sess), sid); cb?.(null); } catch (err) { cb?.(err); }
    }
  }

  return SqliteSessionStore;
};
