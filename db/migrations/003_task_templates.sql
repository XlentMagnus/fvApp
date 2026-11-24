CREATE TABLE IF NOT EXISTS task_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  slots INTEGER NOT NULL DEFAULT 0,
  days TEXT NOT NULL DEFAULT '[]',
  start_time TEXT NOT NULL DEFAULT '10:00',
  end_time TEXT NOT NULL DEFAULT '15:00',
  active INTEGER NOT NULL DEFAULT 1,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);
