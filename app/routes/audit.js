const { Router } = require('express');
const auditRepository = require('../repositories/auditRepository');
const taskRepository = require('../repositories/taskRepository');
const userRepository = require('../repositories/userRepository');
const assignmentRepository = require('../repositories/assignmentRepository');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

// Actions that can be reversed from the log.
const UNDOABLE = {
  signup: 'remove',
  assign: 'remove',
  unsign: 'add',
  unassign: 'add',
};

router.get('/', requireAdmin, async (req, res, next) => {
  try {
    const { limit, offset, task_id, user_id } = req.query;
    const rows = await auditRepository.findAll({
      limit, offset,
      taskId: task_id ? parseInt(task_id, 10) : undefined,
      userId: user_id ? parseInt(user_id, 10) : undefined,
    });
    res.json(rows.map(r => ({ ...r, undoable: !!UNDOABLE[r.action] && !r.undone_at })));
  } catch (err) { next(err); }
});

router.post('/:id/undo', requireAdmin, async (req, res, next) => {
  try {
    const entry = await auditRepository.findById(parseInt(req.params.id, 10));
    if (!entry) return res.status(404).json({ error: 'Loggposten hittades inte' });
    const kind = UNDOABLE[entry.action];
    if (!kind) return res.status(400).json({ error: 'Den här händelsen kan inte ångras' });
    if (entry.undone_at) return res.status(400).json({ error: 'Händelsen är redan ångrad' });

    const task = await taskRepository.findById(entry.task_id);
    if (!task) return res.status(400).json({ error: 'Uppgiften finns inte längre' });
    const user = await userRepository.findById(entry.target_user_id);
    if (!user) return res.status(400).json({ error: 'Personen finns inte längre' });

    if (kind === 'remove') {
      await assignmentRepository.removeByTaskAndUser(task.id, user.id);
      if ((await assignmentRepository.findByTask(task.id)).length === 0 && task.status === 'assigned') {
        await taskRepository.update(task.id, { status: 'planned' });
      }
      await auditRepository.log({ actorKind: 'admin', actor: req.user, action: 'unassign', task, target: user, details: `Ångrade logg #${entry.id}` });
    } else {
      await assignmentRepository.create(task.id, user.id);
      if (task.status === 'planned') await taskRepository.update(task.id, { status: 'assigned' });
      await auditRepository.log({ actorKind: 'admin', actor: req.user, action: 'assign', task, target: user, details: `Ångrade logg #${entry.id}` });
    }
    await auditRepository.markUndone(entry.id, req.user.name);
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
