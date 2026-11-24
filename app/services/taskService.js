const taskRepository = require('../repositories/taskRepository');
const assignmentRepository = require('../repositories/assignmentRepository');
const userRepository = require('../repositories/userRepository');
const auditRepository = require('../repositories/auditRepository');

const httpError = (status, message) => Object.assign(new Error(message), { status });

const ASSIGNMENT_STATUSES = ['assigned', 'accepted', 'declined', 'done'];
const MAX_COMMENT_LENGTH = 1000;

const taskService = {
  list(filters) {
    return taskRepository.findAll(filters);
  },

  getById(id) {
    const task = taskRepository.findById(id);
    if (!task) throw httpError(404, 'Uppgift hittades inte');
    task.assignments = assignmentRepository.findByTask(id);
    return task;
  },

  create(data, actor) {
    const task = taskRepository.create(data);
    if (data.assignees && data.assignees.length > 0) {
      assignmentRepository.bulkAssign(task.id, data.assignees);
      task.assignments = assignmentRepository.findByTask(task.id);
      for (const a of task.assignments) {
        auditRepository.log({ actorKind: 'admin', actor, action: 'assign', task, target: { id: a.user_id, name: a.user_name } });
      }
      if (task.assignments.length > 0) {
        taskRepository.update(task.id, { status: 'assigned' });
        task.status = 'assigned';
      }
    }
    return task;
  },

  update(id, data) {
    const existing = taskRepository.findById(id);
    if (!existing) throw httpError(404, 'Uppgift hittades inte');
    return taskRepository.update(id, data);
  },

  delete(id, actor) {
    const existing = taskRepository.findById(id);
    if (!existing) throw httpError(404, 'Uppgift hittades inte');
    const assigned = assignmentRepository.findByTask(id).map(a => a.user_name);
    taskRepository.delete(id);
    auditRepository.log({
      actorKind: 'admin', actor, action: 'task_delete', task: existing,
      details: assigned.length ? `Anmälda: ${assigned.join(', ')}` : null,
    });
    return { success: true };
  },

  getStats() {
    return taskRepository.getStats();
  },

  getByDateRange(from, to) {
    return taskRepository.findByDateRange(from, to);
  },

  assign(taskId, userIds, actor) {
    const task = taskRepository.findById(taskId);
    if (!task) throw httpError(404, 'Uppgift hittades inte');

    const before = new Set(assignmentRepository.findByTask(taskId).map(a => a.user_id));
    const ids = userIds.map(Number).filter(Number.isInteger);
    const assignments = assignmentRepository.bulkAssign(taskId, ids);
    for (const a of assignments) {
      if (!before.has(a.user_id)) {
        auditRepository.log({ actorKind: 'admin', actor, action: 'assign', task, target: { id: a.user_id, name: a.user_name } });
      }
    }
    if (task.status === 'planned' && assignments.length > 0) {
      taskRepository.update(taskId, { status: 'assigned' });
    }
    return assignments;
  },

  unassign(taskId, userId, actor) {
    const task = taskRepository.findById(taskId);
    const user = userRepository.findById(userId);
    const result = assignmentRepository.removeByTaskAndUser(taskId, userId);
    if (result.changes > 0 && task) {
      auditRepository.log({ actorKind: 'admin', actor, action: 'unassign', task, target: user ? { id: user.id, name: user.name } : { id: userId } });
    }
    const remaining = assignmentRepository.findByTask(taskId);
    if (remaining.length === 0 && task && task.status === 'assigned') {
      taskRepository.update(taskId, { status: 'planned' });
    }
    return remaining;
  },

  /**
   * Members may only update their own assignments; admins may update any.
   */
  updateAssignment(assignmentId, data, actor) {
    const assignment = assignmentRepository.findById(assignmentId);
    if (!assignment) throw httpError(404, 'Tilldelning hittades inte');
    if (actor.role !== 'admin' && assignment.user_id !== actor.id) {
      throw httpError(403, 'Du kan bara ändra dina egna uppgifter');
    }

    const { status, comment } = data || {};
    if (status !== undefined && !ASSIGNMENT_STATUSES.includes(status)) {
      throw httpError(400, 'Ogiltig status');
    }
    if (comment !== undefined && comment !== null && String(comment).length > MAX_COMMENT_LENGTH) {
      throw httpError(400, `Kommentaren får vara högst ${MAX_COMMENT_LENGTH} tecken`);
    }

    const updated = assignmentRepository.update(assignmentId, {
      status,
      comment: comment === undefined ? undefined : (comment === null ? null : String(comment)),
    });

    if (status !== undefined && status !== assignment.status) {
      const task = taskRepository.findById(assignment.task_id);
      auditRepository.log({
        actorKind: actor.role === 'admin' ? 'admin' : 'user', actor, action: 'assignment_status',
        task: task || { id: assignment.task_id, title: assignment.task_title },
        target: { id: assignment.user_id, name: assignment.user_name },
        details: `${assignment.status} → ${status}`,
      });
    }
    return updated;
  },

  getUserAssignments(userId, { upcoming, history } = {}) {
    return assignmentRepository.findByUser(userId, { upcoming, history });
  },
};

module.exports = taskService;
