const categoryService = require('../services/categoryService');

const categoryController = {
  list(req, res, next) {
    try {
      res.json(categoryService.list());
    } catch (err) { next(err); }
  },

  create(req, res, next) {
    try {
      const cat = categoryService.create(req.body);
      res.status(201).json(cat);
    } catch (err) { next(err); }
  },

  update(req, res, next) {
    try {
      const cat = categoryService.update(parseInt(req.params.id), req.body);
      res.json(cat);
    } catch (err) { next(err); }
  },

  delete(req, res, next) {
    try {
      const result = categoryService.delete(parseInt(req.params.id));
      res.json(result);
    } catch (err) { next(err); }
  },
};

module.exports = categoryController;
