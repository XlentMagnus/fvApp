const categoryService = require('../services/categoryService');

const categoryController = {
  async list(req, res, next) {
    try {
      res.json(await categoryService.list());
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const cat = await categoryService.create(req.body);
      res.status(201).json(cat);
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const cat = await categoryService.update(parseInt(req.params.id), req.body);
      res.json(cat);
    } catch (err) { next(err); }
  },

  async delete(req, res, next) {
    try {
      const result = await categoryService.delete(parseInt(req.params.id));
      res.json(result);
    } catch (err) { next(err); }
  },
};

module.exports = categoryController;
