const db = require('../../db/connection');

const assignmentRepository = {
  async findByTask(taskId) {
    return db.all(`
      SELECT ta.*, u.name as user_name, u.email as user_email, u.phone as user_phone, u.skoterkort as user_skoterkort
      FROM task_assignments ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.task_id = ?
      ORDER BY u.name
    `, taskId);
  },

  /** Assignments for many tasks in one query: Map(task_id -> [assignment]). */
  async findByTasks(taskIds) {
    const map = new Map(taskIds.map(id => [id, []]));
    if (!taskIds.length) return map;
    const rows = await db.all(`
      SELECT ta.*, u.name as user_name, u.skoterkort as user_skoterkort
      FROM task_assignments ta
      JOIN users u ON ta.user_id = u.id
      WHERE ta.task_id IN (${taskIds.map(() => '?').join(',')})
      ORDER BY u.name
    `, ...taskIds);
    for (const r of rows) map.get(r.task_id)?.push(r);
    return map;
  },

  async findByUser(userId, { upcoming, history } = {}) {
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
    const now = db.nowLocal().slice(0, 16);

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

    return db.all(sql, ...params);
  },

  async findById(id) {
    return db.get(`
      SELECT ta.*, u.name as user_name, t.title as task_title
      FROM task_assignments ta
      JOIN users u ON ta.user_id = u.id
      JOIN tasks t ON ta.task_id = t.id
      WHERE ta.id = ?
    `, id);
  },

  async create(taskId, userId) {
    await db.run('INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?, ?)', taskId, userId);
    const row = await db.get('SELECT id FROM task_assignments WHERE task_id = ? AND user_id = ?', taskId, userId);
    return this.findById(row.id);
  },

  /**
   * Adds a member only if the task still has a free spot – checked and inserted in
   * ONE statement, so two people can't grab the last spot at the same time.
   * Returns the assignment, or null if the task was full.
   */
  async createIfSpace(taskId, userId) {
    const r = await db.run(`
      INSERT INTO task_assignments (task_id, user_id)
      SELECT ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM task_assignments WHERE task_id = ? AND user_id = ?)
        AND (
          (SELECT slots FROM tasks WHERE id = ?) = 0
          OR (SELECT COUNT(*) FROM task_assignments WHERE task_id = ?) < (SELECT slots FROM tasks WHERE id = ?)
        )
    `, taskId, userId, taskId, userId, taskId, taskId, taskId);
    if (!r.changes) return null;
    return this.findById(r.lastInsertRowid);
  },

  async bulkAssign(taskId, userIds) {
    await db.batch(userIds.map(uid => ['INSERT OR IGNORE INTO task_assignments (task_id, user_id) VALUES (?, ?)', taskId, uid]));
    return this.findByTask(taskId);
  },

  async update(id, { status, comment }) {
    const fields = [];
    const params = [];
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (comment !== undefined) { fields.push('comment = ?'); params.push(comment); }
    if (fields.length === 0) return this.findById(id);

    fields.push("updated_at = datetime('now')");
    params.push(id);
    await db.run(`UPDATE task_assignments SET ${fields.join(', ')} WHERE id = ?`, ...params);
    return this.findById(id);
  },

  async delete(id) {
    return db.run('DELETE FROM task_assignments WHERE id = ?', id);
  },

  async removeByTaskAndUser(taskId, userId) {
    return db.run('DELETE FROM task_assignments WHERE task_id = ? AND user_id = ?', taskId, userId);
  },
};

module.exports = assignmentRepository;
