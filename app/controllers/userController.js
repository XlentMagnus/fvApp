const userService = require('../services/userService');
const userRepository = require('../repositories/userRepository');

const userController = {
  async list(req, res, next) {
    try {
      res.json(await userService.list(req.query));
    } catch (err) { next(err); }
  },

  async getById(req, res, next) {
    try {
      res.json(await userService.getById(parseInt(req.params.id, 10)));
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

  async delete(req, res, next) {
    try {
      res.json(await userService.delete(parseInt(req.params.id, 10), req.user));
    } catch (err) { next(err); }
  },

  async regenerateLink(req, res, next) {
    try {
      res.json(await userService.regenerateLink(parseInt(req.params.id, 10), req.user));
    } catch (err) { next(err); }
  },

  async assignmentStats(req, res, next) {
    try {
      res.json(await userRepository.getAssignmentStats());
    } catch (err) { next(err); }
  },

  async userAssignments(req, res, next) {
    try {
      res.json(await userRepository.getDetailedAssignments(parseInt(req.params.id, 10)));
    } catch (err) { next(err); }
  },
};

module.exports = userController;
