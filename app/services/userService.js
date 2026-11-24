const bcrypt = require('bcrypt');
const crypto = require('crypto');
const userRepository = require('../repositories/userRepository');
const auditRepository = require('../repositories/auditRepository');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(data, { isCreate }) {
  if (isCreate || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) throw httpError(400, 'Namn krävs');
  }
  if (isCreate || data.email !== undefined) {
    if (!data.email || !EMAIL_RE.test(String(data.email).trim())) throw httpError(400, 'Ogiltig e-postadress');
  }
  if (data.role !== undefined && !['admin', 'user'].includes(data.role)) {
    throw httpError(400, 'Ogiltig roll');
  }
  if (data.password && String(data.password).length < 6) {
    throw httpError(400, 'Lösenordet måste vara minst 6 tecken');
  }
  if (data.barn !== undefined && !Array.isArray(data.barn)) {
    throw httpError(400, 'barn måste vara en lista');
  }
}

const userService = {
  list(filters) {
    return userRepository.findAll(filters);
  },

  getById(id) {
    const user = userRepository.findById(id);
    if (!user) throw httpError(404, 'Användare hittades inte');
    return user;
  },

  async create(data, actor) {
    validate(data, { isCreate: true });
    const existing = userRepository.findByEmail(data.email);
    if (existing) throw httpError(409, 'E-postadressen används redan');

    // Members normally use their personal link and never log in. Without a
    // password we store a random, unknown one so the account can't be used to log in.
    const password = data.password || crypto.randomBytes(32).toString('hex');
    const password_hash = await bcrypt.hash(password, 10);
    const user = userRepository.create({ ...data, name: String(data.name).trim(), password_hash });
    auditRepository.log({ actorKind: 'admin', actor, action: 'user_create', target: user });
    return user;
  },

  async update(id, data, actor) {
    const user = userRepository.findById(id);
    if (!user) throw httpError(404, 'Användare hittades inte');
    validate(data, { isCreate: false });

    if (data.email && data.email.trim().toLowerCase() !== user.email.toLowerCase()) {
      const existing = userRepository.findByEmail(data.email);
      if (existing && existing.id !== id) throw httpError(409, 'E-postadressen används redan');
    }

    const losesAdmin = user.role === 'admin' && user.active &&
      ((data.role !== undefined && data.role !== 'admin') || (data.active !== undefined && !data.active));
    if (losesAdmin) {
      if (actor && actor.id === id) throw httpError(400, 'Du kan inte ta bort din egen admin-behörighet eller inaktivera dig själv');
      if (userRepository.countActiveAdmins() <= 1) throw httpError(400, 'Det måste finnas minst en aktiv administratör');
    }

    const updateData = { ...data };
    delete updateData.access_token;
    delete updateData.password_hash;
    if (data.password) {
      updateData.password_hash = await bcrypt.hash(data.password, 10);
    }
    delete updateData.password;

    const updated = userRepository.update(id, updateData);
    if (data.role !== undefined && data.role !== user.role) {
      auditRepository.log({ actorKind: 'admin', actor, action: 'user_role', target: updated, details: `${user.role} → ${data.role}` });
    }
    if (data.active !== undefined && !!data.active !== !!user.active) {
      auditRepository.log({ actorKind: 'admin', actor, action: data.active ? 'user_activate' : 'user_deactivate', target: updated });
    }
    return updated;
  },

  delete(id, actor) {
    const user = userRepository.findById(id);
    if (!user) throw httpError(404, 'Användare hittades inte');
    if (actor && actor.id === id) throw httpError(400, 'Du kan inte ta bort dig själv');
    if (user.role === 'admin' && user.active && userRepository.countActiveAdmins() <= 1) {
      throw httpError(400, 'Det måste finnas minst en aktiv administratör');
    }
    userRepository.delete(id);
    auditRepository.log({ actorKind: 'admin', actor, action: 'user_delete', target: user });
    return { success: true };
  },

  regenerateLink(id, actor) {
    const user = userRepository.findById(id);
    if (!user) throw httpError(404, 'Användare hittades inte');
    const updated = userRepository.regenerateToken(id);
    auditRepository.log({ actorKind: 'admin', actor, action: 'link_regenerate', target: user });
    return updated;
  },
};

module.exports = userService;
