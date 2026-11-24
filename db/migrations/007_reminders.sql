-- Mejlpåminnelser: medlemmen väljer själv (opt-in) via sin personliga sida.
ALTER TABLE users ADD COLUMN email_reminders INTEGER NOT NULL DEFAULT 0;
-- När påminnelsen för en anmälan skickades (så att den bara skickas en gång).
ALTER TABLE task_assignments ADD COLUMN reminder_sent_at TEXT;
