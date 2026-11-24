const db = require('../../db/connection');

const assignmentRepository = {
  findByTask(taskId) {
    return db.prepare(`
      SELECT ta.*, u.name as user_name, u.email as user_email, u.phone as user_phone, u.skoterkort as user_skoterkort
      FROM task_assignments ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.task_id = ?
      ORDER BY u.name
    `).all(taskId);
  },

  findByUser(userId, { upcoming, history } = {}) {
    let sql = `
      SELECT ta.*, t.title, t.description, t.location, t.start_datetime, t.end_datetime,
             t.status as task_status, c.name as category_name, c.color as category_color
      FROM task_assignments ta
      JOIN tasks t ON ta.task_id = t.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE ta.user_id = ?
    `;
    const params = [userId];
    // Task times are stored as local time ("YYYY-MM-DD HH:MM"), so compare with local now – not UTC.
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    const now = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

    if (upcoming) {
      sql += ' AND t.start_datetime >= ?';
      params.push(now);
      sql += ' ORDER BY t.start_datetime ASC';
    } else if (history) {
      sql += ' AND (t.start_datetime < ? OR ta.status = \'done\')';
      params.push(now);
      sql += ' ORDER BY t.start_datetime DESC';
    } else {
      sql += ' ORDER BY t.start_datetime ASC';
    }

    return db.prepare(sql).all(...params);
  },

  findById(id) {
    return db.prepare(`
      SELECT ta.*, u.name as user_name, t.title as task_title
      FROM task_assignments ta
      JOIN users u ON ta.user_id = u.id
      JOIN tasks t ON ta.task_id = t.id
      WHERE ta.id = ?
    `).get(id);
  },

  create(taskId, userId) {
    const existing = db.prepare(
      'SELECT id FROM task_assignments WHERE task_id = ? AND user_id = ?'
    ).get(taskId, userId);
    if (existing) return this.findById(existing.id);

    const result = db.prepare(
      'INSERT INTO task_assignments (task_id, user_id) VALUES (?, ?)'
    ).run(taskId, userId);
    return this.findById(result.lastInsertRowid);
  },

  bulkAssign(taskId, userIds) {
    const insert = db.prepare(
      'INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?, ?)'
    );
    const tx = db.transaction((ids) => {
      for (const uid of ids) insert.run(taskId, uid);
    });
    tx(userIds);
    return this.findByTask(taskId);
  },

  update(id, { status, comment }) {
    const fields = [];
    const params = [];
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (comment !== undefined) { fields.push('comment = ?'); params.push(comment); }
    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    params.push(id);
    db.prepare(`UPDATE task_assignments SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  },

  delete(id) {
    return db.prepare('DELETE FROM task_assignments WHERE id = ?').run(id);
  },

  removeByTaskAndUser(taskId, userId) {
    return db.prepare(
      'DELETE FROM task_assignments WHERE task_id = ? AND user_id = ?'
    ).run(taskId, userId);
  },
};

module.exports = assignmentRepository;
