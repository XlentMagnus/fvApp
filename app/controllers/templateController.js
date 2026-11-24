const templateRepository = require('../repositories/templateRepository');
const taskRepository = require('../repositories/taskRepository');

function localDateStr(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const templateController = {
  list(req, res, next) {
    try {
      res.json(templateRepository.findAll());
    } catch (err) { next(err); }
  },

  getById(req, res, next) {
    try {
      const tmpl = templateRepository.findById(parseInt(req.params.id));
      if (!tmpl) return res.status(404).json({ error: 'Mall hittades inte' });
      res.json(tmpl);
    } catch (err) { next(err); }
  },

  create(req, res, next) {
    try {
      const data = { ...req.body, created_by: req.user.id };
      const tmpl = templateRepository.create(data);
      res.status(201).json(tmpl);
    } catch (err) { next(err); }
  },

  update(req, res, next) {
    try {
      const tmpl = templateRepository.findById(parseInt(req.params.id));
      if (!tmpl) return res.status(404).json({ error: 'Mall hittades inte' });
      const updated = templateRepository.update(tmpl.id, req.body);
      res.json(updated);
    } catch (err) { next(err); }
  },

  delete(req, res, next) {
    try {
      const tmpl = templateRepository.findById(parseInt(req.params.id));
      if (!tmpl) return res.status(404).json({ error: 'Mall hittades inte' });
      templateRepository.delete(tmpl.id);
      res.json({ success: true });
    } catch (err) { next(err); }
  },

  generate(req, res, next) {
    try {
      const tmpl = templateRepository.findById(parseInt(req.params.id));
      if (!tmpl) return res.status(404).json({ error: 'Mall hittades inte' });

      const { from, to } = req.body;
      if (!from || !to) return res.status(400).json({ error: 'from och to krävs (YYYY-MM-DD)' });

      const startDate = new Date(from + 'T00:00:00');
      const endDate = new Date(to + 'T23:59:59');
      if (isNaN(startDate) || isNaN(endDate)) {
        return res.status(400).json({ error: 'Ogiltigt datumformat' });
      }
      if (endDate < startDate) {
        return res.status(400).json({ error: 'Slutdatum måste vara efter startdatum' });
      }

      // JS: 0=Sunday, 1=Monday ... 6=Saturday
      // Template stores: 1=Monday ... 7=Sunday
      const dayMap = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 0 };
      const jsDays = new Set(tmpl.days.map(d => dayMap[d]));

      const created = [];
      const current = new Date(startDate);

      while (current <= endDate) {
        if (jsDays.has(current.getDay())) {
          const dateStr = localDateStr(current);
          const startDt = `${dateStr} ${tmpl.start_time}`;
          const endDt = `${dateStr} ${tmpl.end_time}`;

          const task = taskRepository.create({
            title: tmpl.title,
            description: tmpl.description,
            location: tmpl.location,
            category_id: tmpl.category_id,
            start_datetime: startDt,
            end_datetime: endDt,
            status: 'planned',
            created_by: req.user.id,
            slots: tmpl.slots,
            skoterkort_slots: tmpl.skoterkort_slots || 0,
          });
          created.push(task);
        }
        current.setDate(current.getDate() + 1);
      }

      res.json({ created: created.length, tasks: created });
    } catch (err) { next(err); }
  },
};

module.exports = templateController;
