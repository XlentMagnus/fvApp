-- Kompetenskrav per kategori, används vid automatisk fördelning av pass.
-- Värden: NULL (ingen), 'kan_kiosk', 'skoterkort', 'snolaggning'
ALTER TABLE categories ADD COLUMN required_skill TEXT
  CHECK (required_skill IS NULL OR required_skill IN ('kan_kiosk', 'skoterkort', 'snolaggning'));
UPDATE categories SET required_skill = 'kan_kiosk' WHERE lower(name) LIKE '%kiosk%';
