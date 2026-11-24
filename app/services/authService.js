const bcrypt = require('bcrypt');
const userRepository = require('../repositories/userRepository');

// Compared against when the e-mail doesn't exist, so response time doesn't
// reveal which addresses are registered.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

const authService = {
  async login(email, password) {
    const user = await userRepository.findByEmail(email);
    const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !user.active || !valid) return null;

    return { id: user.id, name: user.name, email: user.email, role: user.role };
  },
};

module.exports = authService;
