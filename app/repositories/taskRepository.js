const db = require('../../db/connection');
const { normaliseSkoterSlots } = require('../services/skoterRule');

const taskRepository = {
  findAll({ status, category_id, from, to, search } = {}) {
    let sql = `
      SELECT t.*, c.name as category_name, c.color as category_color,
             u.name as creator_name
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE 1=1
    `;
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
    return db.prepare(sql).all(...params);
  },

  findById(id) {
    return db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color,
             u.name as creator_name
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN users u ON t.created_by = u.id
      WHERE t.id = ?
    `).get(id);
  },

  create({ title, description, location, category_id, start_datetime, end_datetime, status, created_by, slots, skoterkort_slots, requires_skoterkort }) {
    // Old callers may still send the yes/no flag: then every spot requires skoterkort.
    if (skoterkort_slots === undefined && requires_skoterkort) skoterkort_slots = slots || 1;
    const skoter = normaliseSkoterSlots(skoterkort_slots, slots || 0);
    const result = db.prepare(`
      INSERT INTO tasks (title, description, location, category_id, start_datetime, end_datetime, status, created_by, slots, skoterkort_slots, requires_skoterkort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(title, description || null, location || null, category_id || null,
           start_datetime, end_datetime, status || 'planned', created_by, slots || 0, skoter, skoter > 0 ? 1 : 0);
    return this.findById(result.lastInsertRowid);
  },

  update(id, fields) {
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
      const current = this.findById(id);
      const slots = fields.slots !== undefined ? (parseInt(fields.slots, 10) || 0) : current.slots;
      const skoter = normaliseSkoterSlots(fields.skoterkort_slots !== undefined ? fields.skoterkort_slots : current.skoterkort_slots, slots);
      sets.push('skoterkort_slots = ?', 'requires_skoterkort = ?');
      params.push(skoter, skoter > 0 ? 1 : 0);
    }
    if (sets.length === 0) return this.findById(id);

    sets.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE tasks SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  },

  delete(id) {
    return db.prepare('DELETE FROM tasks WHERE id = ?').run(id);
  },

  getStats() {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay() + 1);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const fmt = d => d.toISOString().slice(0, 10);

    const thisWeek = db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE start_datetime >= ? AND start_datetime <= ?`
    ).get(fmt(weekStart), fmt(weekEnd) + ' 23:59').count;

    const unassigned = db.prepare(`
      SELECT COUNT(*) as count FROM tasks
      WHERE status IN ('planned', 'assigned')
        AND status != 'done' AND status != 'cancelled'
        AND (
          (slots > 0 AND (SELECT COUNT(*) FROM task_assignments WHERE task_id = tasks.id) < slots)
          OR (slots = 0 AND id NOT IN (SELECT DISTINCT task_id FROM task_assignments))
        )
    `).get().count;

    const completed = db.prepare(
      `SELECT COUNT(*) as count FROM tasks WHERE status = 'done'`
    ).get().count;

    const total = db.prepare('SELECT COUNT(*) as count FROM tasks').get().count;

    return { thisWeek, unassigned, completed, total };
  },

  findByDateRange(from, to) {
    const toWithTime = to.includes(' ') ? to : to + ' 23:59:59';
    return db.prepare(`
      SELECT t.*, c.name as category_name, c.color as category_color,
             (SELECT COUNT(*) FROM task_assignments WHERE task_id = t.id) as assigned_count
      FROM tasks t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.start_datetime >= ? AND t.start_datetime <= ?
      ORDER BY t.start_datetime ASC
    `).all(from, toWithTime);
  },
};

module.exports = taskRepository;
