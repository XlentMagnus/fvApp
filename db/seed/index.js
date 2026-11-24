const db = require('../connection');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const config = require('../../config');

// Seeding DELETES all data. Refuse unless the database is empty or --force is given,
// and never run in production.
function guard() {
  const force = process.argv.includes('--force');
  if (config.isProduction) {
    console.error('Vägrar seeda: NODE_ENV=production. Seed raderar all data.');
    process.exit(1);
  }
  const hasData = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").get()
    && db.prepare('SELECT COUNT(*) AS c FROM users').get().c > 0;
  if (hasData && !force) {
    console.error('Databasen innehåller redan data. Seed raderar ALLT (personer, uppgifter, logg).');
    console.error('Kör "npm run seed -- --force" om du verkligen vill det.');
    process.exit(1);
  }
}

async function seed() {
  guard();
  console.log('Seeding database...');

  db.pragma('foreign_keys = OFF');
  db.exec('DELETE FROM task_assignments');
  db.exec('DELETE FROM tasks');
  db.exec('DELETE FROM categories');
  db.exec('DELETE FROM task_templates');
  db.exec('DELETE FROM users');
  db.exec('DELETE FROM audit_log');
  db.exec("DELETE FROM sqlite_sequence");
  db.pragma('foreign_keys = ON');

  const hash = await bcrypt.hash('password123', 10);

  const insertUser = db.prepare(
    `INSERT INTO users (name, email, phone, password_hash, role, skoterkort, kan_kiosk, snolaggning, barn, familj, kommentar, access_token)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const users = [
    // Fictional demo data only – never put real members' contact details in the seed.
    ['Anna Andersson', 'anna@example.com', '070-0000001', hash, 'admin', 0, 1, 0, '["Ava Andersson"]', 'Andersson', null],
    ['Albin Svensson', 'albin.svensson@example.com', '070-0000002', hash, 'user', 1, 0, 1, '["Selma Svensson"]', 'Svensson', null],
    ['Amanda Berg', 'amanda.berg@example.com', '070-0000003', hash, 'user', 0, 1, 0, '["Nelly Berg", "Tage Berg"]', 'Berg', null],
    ['Anders Nilsson', 'anders.nilsson@example.com', '070-0000004', hash, 'user', 1, 1, 2, '["Alvin Nilsson"]', 'Nilsson', null],
    ['Andreas Wikström', 'andreas.wikstrom@example.com', '070-0000005', hash, 'user', 1, 1, 2, '["Svante Wikström"]', 'Wikström', null],
    ['Anna Lindgren', 'anna.lindgren@email.se', '070-0000006', hash, 'admin', 0, 1, 0, '["Elsa Lindgren", "Hugo Lindgren"]', 'Lindgren', null],
    ['Erik Holmberg', 'erik.holmberg@email.se', '070-0000007', hash, 'user', 1, 0, 1, '["Wilma Holmberg"]', 'Holmberg', null],
    ['Maria Björk', 'maria.bjork@email.se', '070-0000008', hash, 'user', 0, 1, 3, '["Axel Björk", "Maja Björk"]', 'Björk', null],
    ['Lars Forsberg', 'lars.forsberg@email.se', '070-0000009', hash, 'user', 1, 0, 1, '["Oliver Forsberg"]', 'Forsberg', 'Har egen skoter'],
    ['Sofia Eklund', 'sofia.eklund@email.se', '070-0000010', hash, 'user', 0, 1, 0, '["Liam Eklund", "Nova Eklund"]', 'Eklund', null],
  ];

  const insertMany = db.transaction((rows) => {
    for (const row of rows) insertUser.run(...row, crypto.randomBytes(16).toString('hex'));
  });
  insertMany(users);

  const insertCat = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)');
  const categories = [
    ['Kioskpass', '#ef4444'],
    ['Städning', '#22c55e'],
    ['Målning', '#3b82f6'],
    ['Arrangemang', '#f59e0b'],
    ['Underhåll', '#8b5cf6'],
    ['Övrigt', '#6b7280'],
  ];
  for (const c of categories) insertCat.run(...c);

  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const addDays = (n) => { const d = new Date(now); d.setDate(d.getDate() + n); return d; };
  const addHours = (d, h) => { const r = new Date(d); r.setHours(r.getHours() + h); return r; };

  const insertTask = db.prepare(
    `INSERT INTO tasks (title, description, location, category_id, start_datetime, end_datetime, status, created_by, slots)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  // [title, desc, location, cat_id, date, hours, status, created_by, slots]
  const taskData = [
    ['Kioskpass lördag', 'Bemanning av kiosken under matchen', 'Kiosken A-plan', 1, addDays(1), 3, 'assigned', 1, 3],
    ['Städning omklädningsrum', 'Grundlig städning efter cupen', 'Omklädningsrum 1-4', 2, addDays(2), 2, 'planned', 1, 4],
    ['Målning av staket', 'Måla om staketet runt B-plan', 'B-plan', 3, addDays(3), 4, 'planned', 1, 5],
    ['Vårfest planering', 'Planera vårfesten – mat, musik, dekoration', 'Klubbhuset', 4, addDays(5), 2, 'planned', 1, 3],
    ['Gräsklippning', 'Klippa gräs runt klubbhuset', 'Klubbhuset', 5, addDays(0), 2, 'assigned', 1, 1],
    ['Kioskpass söndag', 'Bemanning av kiosken under söndagsmatchen', 'Kiosken A-plan', 1, addDays(4), 3, 'planned', 7, 2],
    ['Rensa förrådet', 'Gå igenom och sortera förrådet', 'Förrådet', 6, addDays(6), 3, 'planned', 7, 2],
    ['Fixardag', 'Allmän fixardag – diverse småjobb', 'Hela anläggningen', 5, addDays(7), 5, 'planned', 1, 8],
    ['Städning efter match', 'Plocka skräp efter matchen', 'A-plan', 2, addDays(-1), 2, 'done', 1, 2],
    ['Julmarknad', 'Julmarknad med försäljning och fika', 'Klubbhuset', 4, addDays(14), 6, 'planned', 7, 6],
  ];

  for (const t of taskData) {
    const start = fmt(t[4]);
    const end = fmt(addHours(t[4], t[5]));
    insertTask.run(t[0], t[1], t[2], t[3], start, end, t[6], t[7], t[8]);
  }

  const insertAssign = db.prepare(
    'INSERT INTO task_assignments (task_id, user_id, status, comment) VALUES (?, ?, ?, ?)'
  );

  const assignments = [
    [1, 2, 'accepted', 'Jag fixar det!'],
    [1, 3, 'assigned', null],
    [5, 4, 'assigned', null],
    [5, 5, 'accepted', 'Tar med gräsklippare'],
    [9, 2, 'done', 'Klart!'],
    [9, 6, 'done', null],
  ];
  for (const a of assignments) insertAssign.run(...a);

  const insertTemplate = db.prepare(
    `INSERT INTO task_templates (name, title, description, location, category_id, slots, days, start_time, end_time, created_by, skoterkort_slots, requires_skoterkort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const templates = [
    ['Kioskpass vardagar', 'Kioskpass', 'Bemanning av kiosken under träning', 'Kiosken A-plan', 1, 2, '[1,3,4]', '17:00', '20:00', 1, 0],
    ['Kioskpass helg', 'Kioskpass helg', 'Bemanning av kiosken under match', 'Kiosken A-plan', 1, 3, '[6,7]', '10:00', '15:00', 1, 0],
    ['Veckostädning', 'Städning klubbhus', 'Veckostädning av klubbhuset', 'Klubbhuset', 2, 2, '[5]', '16:00', '18:00', 1, 0],
    ['Skoterförare', 'Skoterförare pistning', 'Pistning av spår', 'Skidspåret', 5, 1, '[1,3,6,7]', '07:00', '09:00', 7, 1],
    // 2 platser, varav 1 kräver skoterkort
    ['Liftvärd helg', 'Liftvärd', 'Bemanning av liften', 'Slalombacken', 6, 2, '[6,7]', '09:00', '16:00', 7, 1],
  ];
  for (const t of templates) insertTemplate.run(...t, t[10] > 0 ? 1 : 0);

  console.log('Seed complete.');
  console.log('  Admin login: anna@example.com / password123');
  console.log('  User login:  erik.holmberg@email.se / password123');
}

seed().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
