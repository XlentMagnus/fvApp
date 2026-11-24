-- Personliga länkar: varje medlem får en hemlig nyckel som används i länken till översikten.
ALTER TABLE users ADD COLUMN access_token TEXT;
UPDATE users SET access_token = lower(hex(randomblob(16))) WHERE access_token IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_access_token ON users(access_token);

-- Ändringslogg: vem gjorde vad, och när. Namn och titlar sparas som text så att
-- loggen går att läsa även om uppgiften eller personen tas bort senare.
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  actor_kind TEXT NOT NULL CHECK(actor_kind IN ('member', 'admin', 'user', 'system')),
  actor_id INTEGER,
  actor_name TEXT,
  action TEXT NOT NULL,
  task_id INTEGER,
  task_title TEXT,
  task_start TEXT,
  target_user_id INTEGER,
  target_name TEXT,
  details TEXT,
  undone_at TEXT,
  undone_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
