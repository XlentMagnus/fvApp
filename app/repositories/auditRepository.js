const db = require('../../db/connection');

const auditRepository = {
  /**
   * @param {object} e
   * @param {'member'|'admin'|'user'|'system'} e.actorKind
   * @param {{id:number,name:string}|null} e.actor
   * @param {string} e.action  e.g. 'signup', 'unsign', 'assign', 'unassign', 'assignment_status', ...
   * @param {{id:number,title:string,start_datetime:string}|null} [e.task]
   * @param {{id:number,name:string}|null} [e.target]
   * @param {string|object|null} [e.details]
   */
  log({ actorKind, actor, action, task, target, details }) {
    const res = db.prepare(`
      INSERT INTO audit_log (actor_kind, actor_id, actor_name, action, task_id, task_title, task_start, target_user_id, target_name, details)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      actorKind,
      actor?.id ?? null,
      actor?.name ?? null,
      action,
      task?.id ?? null,
      task?.title ?? null,
      task?.start_datetime ?? null,
      target?.id ?? null,
      target?.name ?? null,
      details == null ? null : (typeof details === 'string' ? details : JSON.stringify(details))
    );
    return res.lastInsertRowid;
  },

  findAll({ limit = 200, offset = 0, taskId, userId } = {}) {
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (taskId) { sql += ' AND task_id = ?'; params.push(taskId); }
    if (userId) { sql += ' AND (target_user_id = ? OR actor_id = ?)'; params.push(userId, userId); }
    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000), Math.max(parseInt(offset, 10) || 0, 0));
    return db.prepare(sql).all(...params);
  },

  findById(id) {
    return db.prepare('SELECT * FROM audit_log WHERE id = ?').get(id);
  },

  markUndone(id, byName) {
    db.prepare("UPDATE audit_log SET undone_at = datetime('now', 'localtime'), undone_by = ? WHERE id = ?").run(byName, id);
  },
};

module.exports = auditRepository;
