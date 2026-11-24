const db = require('../../db/connection');

const categoryRepository = {
  async findAll() {
    return db.all('SELECT * FROM categories ORDER BY name');
  },

  async findById(id) {
    return db.get('SELECT * FROM categories WHERE id = ?', id);
  },

  async create({ name, color }) {
    const result = await db.run('INSERT INTO categories (name, color) VALUES (?, ?)', name, color);
    return this.findById(result.lastInsertRowid);
  },

  async update(id, { name, color, required_skill }) {
    const fields = [];
    const params = [];
    if (required_skill !== undefined) { fields.push('required_skill = ?'); params.push(required_skill || null); }
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (color !== undefined) { fields.push('color = ?'); params.push(color); }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    await db.run(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`, ...params);
    return this.findById(id);
  },

  async delete(id) {
    const results = await db.batch([
      ['UPDATE tasks SET category_id = NULL WHERE category_id = ?', id],
      ['UPDATE task_templates SET category_id = NULL WHERE category_id = ?', id],
      ['DELETE FROM categories WHERE id = ?', id],
    ]);
    return results[2];
  },
};

module.exports = categoryRepository;
