-- Misslyckade inloggningar (rate limiting). Lagras i databasen eftersom serverless-
-- instanser på Vercel inte delar minne.
CREATE TABLE IF NOT EXISTS login_failures (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at INTEGER NOT NULL
);
