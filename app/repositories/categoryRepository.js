const db = require('../../db/connection');

const categoryRepository = {
  findAll() {
    return db.prepare('SELECT * FROM categories ORDER BY name').all();
  },

  findById(id) {
    return db.prepare('SELECT * FROM categories WHERE id = ?').get(id);
  },

  create({ name, color }) {
    const result = db.prepare('INSERT INTO categories (name, color) VALUES (?, ?)').run(name, color);
    return this.findById(result.lastInsertRowid);
  },

  update(id, { name, color, required_skill }) {
    const fields = [];
    const params = [];
    if (required_skill !== undefined) { fields.push('required_skill = ?'); params.push(required_skill || null); }
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (color !== undefined) { fields.push('color = ?'); params.push(color); }
    if (fields.length === 0) return this.findById(id);
    params.push(id);
    db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  },

  delete(id) {
    return db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  },
};

module.exports = categoryRepository;
