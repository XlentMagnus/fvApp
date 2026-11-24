const { Router } = require('express');
const autoAssignService = require('../services/autoAssignService');
const { requireAdmin } = require('../middleware/auth');

const router = Router();

// Compute a proposal (nothing is saved).
router.post('/preview', requireAdmin, (req, res, next) => {
  try {
    res.json(autoAssignService.preview(req.body || {}));
  } catch (err) { next(err); }
});

// Save a proposal (every pair is re-validated first).
router.post('/apply', requireAdmin, (req, res, next) => {
  try {
    res.json(autoAssignService.apply(req.body || {}, req.user));
  } catch (err) { next(err); }
});

module.exports = router;
