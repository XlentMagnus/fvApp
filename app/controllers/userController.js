const userService = require('../services/userService');
const userRepository = require('../repositories/userRepository');

const userController = {
  list(req, res, next) {
    try {
      res.json(userService.list(req.query));
    } catch (err) { next(err); }
  },

  getById(req, res, next) {
    try {
      res.json(userService.getById(parseInt(req.params.id, 10)));
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const user = await userService.create(req.body, req.user);
      res.status(201).json(user);
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const user = await userService.update(parseInt(req.params.id, 10), req.body, req.user);
      res.json(user);
    } catch (err) { next(err); }
  },

  delete(req, res, next) {
    try {
      res.json(userService.delete(parseInt(req.params.id, 10), req.user));
    } catch (err) { next(err); }
  },

  regenerateLink(req, res, next) {
    try {
      res.json(userService.regenerateLink(parseInt(req.params.id, 10), req.user));
    } catch (err) { next(err); }
  },

  assignmentStats(req, res, next) {
    try {
      res.json(userRepository.getAssignmentStats());
    } catch (err) { next(err); }
  },

  userAssignments(req, res, next) {
    try {
      res.json(userRepository.getDetailedAssignments(parseInt(req.params.id, 10)));
    } catch (err) { next(err); }
  },
};

module.exports = userController;
