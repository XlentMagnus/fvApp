const taskService = require('../services/taskService');
const assignmentRepository = require('../repositories/assignmentRepository');

const taskController = {
  list(req, res, next) {
    try {
      const tasks = taskService.list(req.query);
      res.json(tasks);
    } catch (err) { next(err); }
  },

  getById(req, res, next) {
    try {
      const task = taskService.getById(parseInt(req.params.id));
      res.json(task);
    } catch (err) { next(err); }
  },

  create(req, res, next) {
    try {
      const data = { ...req.body, created_by: req.user.id };
      const task = taskService.create(data, req.user);
      res.status(201).json(task);
    } catch (err) { next(err); }
  },

  update(req, res, next) {
    try {
      const task = taskService.update(parseInt(req.params.id), req.body);
      res.json(task);
    } catch (err) { next(err); }
  },

  delete(req, res, next) {
    try {
      const result = taskService.delete(parseInt(req.params.id), req.user);
      res.json(result);
    } catch (err) { next(err); }
  },

  getStats(req, res, next) {
    try {
      const stats = taskService.getStats();
      res.json(stats);
    } catch (err) { next(err); }
  },

  getByDateRange(req, res, next) {
    try {
      const { from, to } = req.query;
      if (!from || !to) {
        return res.status(400).json({ error: 'from och to krävs' });
      }
      const tasks = taskService.getByDateRange(from, to);
      for (const t of tasks) {
        const assignments = assignmentRepository.findByTask(t.id);
        t.assigned_names = assignments.map(a => a.user_name);
      }
      res.json(tasks);
    } catch (err) { next(err); }
  },

  assign(req, res, next) {
    try {
      const taskId = parseInt(req.params.id);
      const { user_ids } = req.body;
      if (!user_ids || !Array.isArray(user_ids)) {
        return res.status(400).json({ error: 'user_ids krävs som array' });
      }
      const assignments = taskService.assign(taskId, user_ids, req.user);
      res.json(assignments);
    } catch (err) { next(err); }
  },

  unassign(req, res, next) {
    try {
      const taskId = parseInt(req.params.id);
      const userId = parseInt(req.params.userId);
      const remaining = taskService.unassign(taskId, userId, req.user);
      res.json(remaining);
    } catch (err) { next(err); }
  },

  updateAssignment(req, res, next) {
    try {
      const assignment = taskService.updateAssignment(parseInt(req.params.id), req.body, req.user);
      res.json(assignment);
    } catch (err) { next(err); }
  },

  myTasks(req, res, next) {
    try {
      const userId = req.user.id;
      const upcoming = taskService.getUserAssignments(userId, { upcoming: true });
      const history = taskService.getUserAssignments(userId, { history: true });
      res.json({ upcoming, history });
    } catch (err) { next(err); }
  },
};

module.exports = taskController;
