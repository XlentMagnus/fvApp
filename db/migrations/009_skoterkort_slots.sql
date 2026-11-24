-- Antal platser på ett pass som kräver skoterkort (t.ex. Liftvärd: 2 platser, varav 1 med skoterkort).
-- Ersätter den tidigare ja/nej-flaggan requires_skoterkort, som hålls synkad för bakåtkompatibilitet.
ALTER TABLE tasks ADD COLUMN skoterkort_slots INTEGER NOT NULL DEFAULT 0;
ALTER TABLE task_templates ADD COLUMN skoterkort_slots INTEGER NOT NULL DEFAULT 0;

-- Tidigare "kräver skoterkort" = alla platser kräver skoterkort (minst 1 om antal platser saknas).
UPDATE tasks SET skoterkort_slots = CASE WHEN slots > 0 THEN slots ELSE 1 END WHERE requires_skoterkort = 1;
UPDATE task_templates SET skoterkort_slots = CASE WHEN slots > 0 THEN slots ELSE 1 END WHERE requires_skoterkort = 1;
