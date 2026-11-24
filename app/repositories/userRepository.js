const crypto = require('crypto');
const db = require('../../db/connection');

const USER_COLS = 'id, name, email, phone, role, active, skoterkort, kan_kiosk, snolaggning, barn, familj, kommentar, access_token, email_reminders, created_at';

function newToken() {
  return crypto.randomBytes(16).toString('hex');
}

function parseUser(row) {
  if (!row) return row;
  try { row.barn = JSON.parse(row.barn || '[]'); } catch { row.barn = []; }
  return row;
}

const userRepository = {
  findAll({ search, role, active } = {}) {
    let sql = `SELECT ${USER_COLS} FROM users WHERE 1=1`;
    const params = [];

    if (search) {
      sql += ' AND (name LIKE ? OR email LIKE ? OR familj LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    if (role) {
      sql += ' AND role = ?';
      params.push(role);
    }
    if (active !== undefined) {
      sql += ' AND active = ?';
      params.push(active ? 1 : 0);
    }

    sql += ' ORDER BY familj, name';
    return db.prepare(sql).all(...params).map(parseUser);
  },

  findById(id) {
    return parseUser(
      db.prepare(`SELECT ${USER_COLS} FROM users WHERE id = ?`).get(id)
    );
  },

  findByEmail(email) {
    if (!email) return undefined;
    return db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(String(email).trim());
  },

  findByToken(token) {
    return parseUser(
      db.prepare(`SELECT ${USER_COLS} FROM users WHERE access_token = ?`).get(token)
    );
  },

  regenerateToken(id) {
    db.prepare("UPDATE users SET access_token = ?, updated_at = datetime('now') WHERE id = ?").run(newToken(), id);
    return this.findById(id);
  },

  setEmailReminders(id, enabled) {
    db.prepare("UPDATE users SET email_reminders = ?, updated_at = datetime('now') WHERE id = ?").run(enabled ? 1 : 0, id);
    return this.findById(id);
  },

  countActiveAdmins() {
    return db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'admin' AND active = 1").get().count;
  },

  create({ name, email, phone, password_hash, role = 'user', skoterkort, kan_kiosk, snolaggning, barn, familj, kommentar }) {
    const result = db.prepare(
      `INSERT INTO users (name, email, phone, password_hash, role, skoterkort, kan_kiosk, snolaggning, barn, familj, kommentar, access_token)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      name, String(email).trim(), phone || null, password_hash, role,
      skoterkort ? 1 : 0, kan_kiosk ? 1 : 0, snolaggning || 0,
      JSON.stringify(barn || []), familj || null, kommentar || null, newToken()
    );
    return this.findById(result.lastInsertRowid);
  },

  update(id, fields) {
    const sets = [];
    const params = [];

    const simple = ['name', 'email', 'phone', 'role', 'password_hash', 'familj', 'kommentar'];
    for (const key of simple) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(fields[key]);
      }
    }

    const booleans = ['skoterkort', 'kan_kiosk', 'active'];
    for (const key of booleans) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        params.push(fields[key] ? 1 : 0);
      }
    }

    if (fields.snolaggning !== undefined) {
      sets.push('snolaggning = ?');
      params.push(parseInt(fields.snolaggning) || 0);
    }

    if (fields.barn !== undefined) {
      sets.push('barn = ?');
      params.push(JSON.stringify(fields.barn));
    }

    if (sets.length === 0) return this.findById(id);

    sets.push("updated_at = datetime('now')");
    params.push(id);

    db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...params);
    return this.findById(id);
  },

  delete(id) {
    return db.prepare('DELETE FROM users WHERE id = ?').run(id);
  },

  count() {
    return db.prepare('SELECT COUNT(*) as count FROM users WHERE active = 1').get().count;
  },

  getAssignmentStats() {
    return db.prepare(`
      SELECT
        u.id, u.name, u.email, u.phone, u.familj,
        u.skoterkort, u.kan_kiosk, u.snolaggning,
        COUNT(ta.id) as total_assignments,
        SUM(CASE WHEN ta.status = 'done' THEN 1 ELSE 0 END) as done_count,
        SUM(CASE WHEN ta.status = 'accepted' THEN 1 ELSE 0 END) as accepted_count,
        SUM(CASE WHEN ta.status = 'assigned' THEN 1 ELSE 0 END) as assigned_count,
        SUM(CASE WHEN ta.status = 'declined' THEN 1 ELSE 0 END) as declined_count
      FROM users u
      LEFT JOIN task_assignments ta ON u.id = ta.user_id
      WHERE u.active = 1
      GROUP BY u.id
      ORDER BY total_assignments DESC, u.name ASC
    `).all();
  },

  getDetailedAssignments(userId) {
    return db.prepare(`
      SELECT ta.status as assignment_status, ta.comment,
             t.id as task_id, t.title, t.start_datetime, t.end_datetime, t.location, t.status as task_status,
             c.name as category_name, c.color as category_color
      FROM task_assignments ta
      JOIN tasks t ON ta.task_id = t.id
      LEFT JOIN categories c ON t.category_id = c.id
      WHERE ta.user_id = ?
      ORDER BY t.start_datetime DESC
    `).all(userId);
  },
};

module.exports = userRepository;
