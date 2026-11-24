const db = require('../../db/connection');
const { normaliseSkoterSlots } = require('../services/skoterRule');

function parseDays(row) {
  if (row) {
    try { row.days = JSON.parse(row.days || '[]'); } catch { row.days = []; }
  }
  return row;
}

const templateRepository = {
  async findAll() {
    return (await db.all(`
      SELECT t.*, c.name as category_name, c.color as category_color, u.name as creator_name
      FROM task_templates t
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN users u ON t.created_by = u.id
      ORDER BY t.name ASC
    `)).map(parseDays);
  },

  async findById(id) {
    return parseDays(await db.get(`
      SELECT t.*, c.name as category_name, c.color as category_color
      FROM task_templates t
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE t.id = ?
    `, id));
  },

  async create({ name, title, description, location, category_id, slots, days, start_time, end_time, created_by, skoterkort_slots, requires_skoterkort }) {
    if (skoterkort_slots === undefined && requires_skoterkort) skoterkort_slots = slots || 1;
    const skoter = normaliseSkoterSlots(skoterkort_slots, slots || 0);
    const result = await db.run(`
      INSERT INTO task_templates (name, title, description, location, category_id, slots, days, start_time, end_time, created_by, skoterkort_slots, requires_skoterkort)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      name, title, description || null, location || null,
      category_id || null, slots || 0,
      JSON.stringify(days || []), start_time || '10:00', end_time || '15:00',
      created_by, skoter, skoter > 0 ? 1 : 0
    );
    return this.findById(result.lastInsertRowid);
  },

  async update(id, fields) {
    const allowed = ['name', 'title', 'description', 'location', 'category_id', 'slots', 'start_time', 'end_time', 'active'];
    const sets = [];
    const params = [];

    for (const key of allowed) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }
    if (fields.days !== undefined) {
      sets.push('days = ?');
      params.push(JSON.stringify(fields.days));
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

    await db.run(`UPDATE task_templates SET ${sets.join(', ')} WHERE id = ?`, ...params);
    return this.findById(id);
  },

  async delete(id) {
    return db.run('DELETE FROM task_templates WHERE id = ?', id);
  },
};

module.exports = templateRepository;
