const db = require('../../db/connection');

/** Builds the INSERT for one log entry (also used inside batches). */
function logStatement({ actorKind, actor, action, task, target, details }) {
  return [
    `INSERT INTO audit_log (created_at, actor_kind, actor_id, actor_name, action, task_id, task_title, task_start, target_user_id, target_name, details)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    // Local time from the app – the database server's "localtime" is UTC on Turso.
    db.nowLocal(),
    actorKind,
    actor?.id ?? null,
    actor?.name ?? null,
    action,
    task?.id ?? null,
    task?.title ?? null,
    task?.start_datetime ?? null,
    target?.id ?? null,
    target?.name ?? null,
    details == null ? null : (typeof details === 'string' ? details : JSON.stringify(details)),
  ];
}

const auditRepository = {
  logStatement,

  /**
   * @param {object} e
   * @param {'member'|'admin'|'user'|'system'} e.actorKind
   * @param {{id:number,name:string}|null} e.actor
   * @param {string} e.action  e.g. 'signup', 'unsign', 'assign', 'unassign', 'assignment_status', ...
   * @param {{id:number,title:string,start_datetime:string}|null} [e.task]
   * @param {{id:number,name:string}|null} [e.target]
   * @param {string|object|null} [e.details]
   */
  async log(entry) {
    const res = await db.run(...logStatement(entry));
    return res.lastInsertRowid;
  },

  async findAll({ limit = 200, offset = 0, taskId, userId } = {}) {
    let sql = 'SELECT * FROM audit_log WHERE 1=1';
    const params = [];
    if (taskId) { sql += ' AND task_id = ?'; params.push(taskId); }
    if (userId) { sql += ' AND (target_user_id = ? OR actor_id = ?)'; params.push(userId, userId); }
    sql += ' ORDER BY id DESC LIMIT ? OFFSET ?';
    params.push(Math.min(Math.max(parseInt(limit, 10) || 200, 1), 1000), Math.max(parseInt(offset, 10) || 0, 0));
    return db.all(sql, ...params);
  },

  async findById(id) {
    return db.get('SELECT * FROM audit_log WHERE id = ?', id);
  },

  async markUndone(id, byName) {
    await db.run('UPDATE audit_log SET undone_at = ?, undone_by = ? WHERE id = ?', db.nowLocal(), byName, id);
  },
};

module.exports = auditRepository;
