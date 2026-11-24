const taskService = require('../services/taskService');
const assignmentRepository = require('../repositories/assignmentRepository');

const taskController = {
  async list(req, res, next) {
    try {
      const tasks = await taskService.list(req.query);
      res.json(tasks);
    } catch (err) { next(err); }
  },

  async getById(req, res, next) {
    try {
      const task = await taskService.getById(parseInt(req.params.id));
      res.json(task);
    } catch (err) { next(err); }
  },

  async create(req, res, next) {
    try {
      const data = { ...req.body, created_by: req.user.id };
      const task = await taskService.create(data, req.user);
      res.status(201).json(task);
    } catch (err) { next(err); }
  },

  async update(req, res, next) {
    try {
      const task = await taskService.update(parseInt(req.params.id), req.body);
      res.json(task);
    } catch (err) { next(err); }
  },

  async delete(req, res, next) {
    try {
      const result = await taskService.delete(parseInt(req.params.id), req.user);
      res.json(result);
    } catch (err) { next(err); }
  },

  async getStats(req, res, next) {
    try {
      const stats = await taskService.getStats();
      res.json(stats);
    } catch (err) { next(err); }
  },

  async getByDateRange(req, res, next) {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ error: 'from och to krävs' });
      }
      const tasks = await taskService.getByDateRange(from, to);
      const byTask = await assignmentRepository.findByTasks(tasks.map(t => t.id));
      for (const t of tasks) t.assigned_names = byTask.get(t.id).map(a => a.user_name);
      res.json(tasks);
    } catch (err) { next(err); }
  },

  async assign(req, res, next) {
    try {
      const taskId = parseInt(req.params.id);
      const { user_ids } = req.body;
      if (!user_ids || !Array.isArray(user_ids)) {
        return res.status(400).json({ error: 'user_ids krävs som array' });
      }
      const assignments = await taskService.assign(taskId, user_ids, req.user);
      res.json(assignments);
    } catch (err) { next(err); }
  },

  async unassign(req, res, next) {
    try {
      const taskId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);
      const remaining = await taskService.unassign(taskId, userId, req.user);
      res.json(remaining);
    } catch (err) { next(err); }
  },

  async updateAssignment(req, res, next) {
    try {
      const assignment = await taskService.updateAssignment(parseInt(req.params.id), req.body, req.user);
      res.json(assignment);
    } catch (err) { next(err); }
  },

  async myTasks(req, res, next) {
    try {
      const userId = req.user.id;
      const upcoming = await taskService.getUserAssignments(userId, { upcoming: true });
      const history = await taskService.getUserAssignments(userId, { history: true });
      res.json({ upcoming, history });
    } catch (err) { next(err); }
  },
};

module.exports = taskController;
