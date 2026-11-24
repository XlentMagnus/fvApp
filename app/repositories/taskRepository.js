const db = require('../../db/connection');
const { normaliseSkoterSlots } = require('../services/skoterRule');

const TASK_SELECT = `
  SELECT t.*, c.name as category_name, c.color as category_color,
         u.name as creator_name
  FROM tasks t
  LEFT JOIN categories c ON t.category_id = c.id
  LEFT JOIN users u ON t.created_by = u.id
`;

function insertArgs({ title, description, location, category_id, start_datetime, end_datetime, status, created_by, slots, skoterkort_slots, requires_skoterkort }) {
  // Old callers may still send the yes/no flag: then every spot requires skoterkort.
  if (skoterkort_slots === undefined && requires_skoterkort) skoterkort_slots = slots || 1;
  const skoter = normaliseSkoterSlots(skoterkort_slots, slots || 0);
  return [
    `INSERT INTO tasks (title, description, location, category_id, start_datetime, end_datetime, status, created_by, slots, skoterkort_slots, requires_skoterkort)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    title, description || null, location || null, category_id || null,
    start_datetime, end_datetime, status || 'planned', created_by, slots || 0, skoter, skoter > 0 ? 1 : 0,
  ];
}

const taskRepository = {
  async findAll({ status, category_id, from, to, search } = {}) {
    let sql = `${TASK_SELECT} WHERE 1=1`;
    const params = [];

    if (status) { sql += ' AND t.status = ?'; params.push(status); }
    if (category_id) { sql += ' AND t.category_id = ?'; params.push(category_id); }
    if (from) { sql += ' AND t.start_datetime >= ?'; params.push(from); }
    if (to) { sql += ' AND t.start_datetime <= ?'; params.push(to); }
    if (search) {
      sql += ' AND (t.title LIKE ? OR t.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    sql += ' ORDER BY t.start_datetime ASC';
    return db.all(sql, ...params);
  },

  async findById(id) {
    return db.get(`${TASK_SELECT} WHERE t.id = ?`, id);
  },

  async create(data) {
    const result = await db.run(...insertArgs(data));
    return this.findById(result.lastInsertRowid);
  },

  /** Creates many tasks in one transaction (used when generating from templates). */
  async createMany(list) {
    if (!list.length) return [];
    const results = await db.batch(list.map(insertArgs));
    const ids = results.map(r => r.lastInsertRowid);
    const rows = await db.all(`${TASK_SELECT} WHERE t.id IN (${ids.map(() => '?').join(',')}) ORDER BY t.start_datetime`, ...ids);
    return rows;
  },

  async update(id, fields) {
    const allowed = ['title', 'description', 'location', 'category_id', 'start_datetime', 'end_datetime', 'status', 'slots'];
    const sets = [];
    const params = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }

    if (fields.skoterkort_slots !== undefined || fields.slots !== undefined) {
      const current = await this.findById(id);
      const slots = fields.slots !== undefined ? (parseInt(fields.slots, 10) || 0) : current.slots;
      const skoter = normaliseSkoterSlots(fields.skoterkort_slots !== undefined ? fields.skoterkort_slots : current.skoterkort_slots, slots);
      sets.push('skoterkort_slots = ?', 'requires_skoterkort = ?');
      params.push(skoter, skoter > 0 ? 1 : 0);
    }
    if (sets.length === 0) return this.findById(id);

    sets.push("updated_at = datetime('now')");
    params.push(id);

    await db.run(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`, ...params);
    return this.findById(id);
  },

  async delete(id) {
    const results = await db.batch([
      ['DELETE FROM task_assignments WHERE task_id = ?', id],
      ['DELETE FROM tasks WHERE id = ?', id],
    ]);
    return results[1];
  },

  async getStats() {
    // Monday–Sunday of the current week, in local time.
    const now = new Date();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const row = await db.get(`
      SELECT
        (SELECT COUNT(*) FROM tasks WHERE start_datetime >= ? AND start_datetime <= ?) AS thisWeek,
        (SELECT COUNT(*) FROM tasks
          WHERE status IN ('planned', 'assigned')
            AND (
              (slots > 0 AND (SELECT COUNT(*) FROM task_assignments WHERE task_id = tasks.id) < slots)
              OR (slots = 0 AND id NOT IN (SELECT DISTINCT task_id FROM task_assignments))
            )) AS unassigned,
        (SELECT COUNT(*) FROM tasks WHERE status = 'done') AS completed,
        (SELECT COUNT(*) FROM tasks) AS total
    `, fmt(monday), fmt(sunday) + ' 23:59');
    return row;
  },

  async findByDateRange(from, to) {
    const toWithTime = to.includes(' ') ? to : to + ' 23:59:59';
    return db.all(`
      SELECT t.*, c.name as category_name, c.color as category_color,
             (SELECT COUNT(*) FROM task_assignments WHERE task_id = t.id) as assigned_count
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.start_datetime >= ? AND t.start_datetime <= ?
      ORDER BY t.start_datetime ASC
    `, from, toWithTime);
  },
};

module.exports = taskRepository;
