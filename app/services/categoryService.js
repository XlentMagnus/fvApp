const categoryRepository = require('../repositories/categoryRepository');

const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const SKILLS = ['kan_kiosk', 'skoterkort', 'snolaggning'];

function validate({ name, color, required_skill }, isCreate) {
  if (required_skill !== undefined && required_skill !== null && required_skill !== '' && !SKILLS.includes(required_skill)) {
    throw Object.assign(new Error('Ogiltigt kompetenskrav'), { status: 400 });
  }
  if ((isCreate || name !== undefined) && (!name || !String(name).trim())) {
    throw Object.assign(new Error('Namn krävs'), { status: 400 });
  }
  if (color !== undefined && !COLOR_RE.test(String(color))) {
    throw Object.assign(new Error('Färgen måste anges som #RRGGBB'), { status: 400 });
  }
}

const categoryService = {
  list() {
    return categoryRepository.findAll();
  },

  getById(id) {
    const cat = categoryRepository.findById(id);
    if (!cat) throw Object.assign(new Error('Kategori hittades inte'), { status: 404 });
    return cat;
  },

  create(data) {
    validate(data, true);
    return categoryRepository.create(data);
  },

  update(id, data) {
    const cat = categoryRepository.findById(id);
    if (!cat) throw Object.assign(new Error('Kategori hittades inte'), { status: 404 });
    validate(data, false);
    return categoryRepository.update(id, data);
  },

  delete(id) {
    const cat = categoryRepository.findById(id);
    if (!cat) throw Object.assign(new Error('Kategori hittades inte'), { status: 404 });
    categoryRepository.delete(id);
    return { success: true };
  },
};

module.exports = categoryService;
