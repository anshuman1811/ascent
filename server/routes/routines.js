const express = require('express');
const db = require('../db/index');
const router = express.Router();

function getRoutineWithExercises(routineId) {
  const routine = db.prepare('SELECT * FROM routines WHERE id = ?').get(routineId);
  if (!routine) return null;
  const exercises = db.prepare(`
    SELECT re.*, e.name as exercise_name, e.exercise_type,
      e.primary_muscles, e.secondary_muscles, e.met_value,
      e.description, e.notes as exercise_notes, e.gif_url
    FROM routine_exercises re
    JOIN exercises e ON e.id = re.exercise_id
    WHERE re.routine_id = ?
    ORDER BY re.order_index ASC
  `).all(routineId).map(r => ({
    ...r,
    primary_muscles: JSON.parse(r.primary_muscles || '[]'),
    secondary_muscles: JSON.parse(r.secondary_muscles || '[]'),
  }));
  return { ...routine, exercises };
}

// GET /api/routines/user/:userId
router.get('/user/:userId', (req, res) => {
  const routines = db.prepare('SELECT id FROM routines WHERE user_id = ? ORDER BY name ASC')
    .all(req.params.userId);
  res.json(routines.map(r => getRoutineWithExercises(r.id)));
});

// GET /api/routines/:id
router.get('/:id', (req, res) => {
  const routine = getRoutineWithExercises(req.params.id);
  if (!routine) return res.status(404).json({ error: 'Routine not found' });
  res.json(routine);
});

// POST /api/routines
router.post('/', (req, res) => {
  const { user_id, name, notes } = req.body;
  if (!user_id || !name) return res.status(400).json({ error: 'user_id and name are required' });

  const result = db.prepare('INSERT INTO routines (user_id, name, notes) VALUES (?, ?, ?)')
    .run(user_id, name, notes ?? null);
  res.status(201).json(getRoutineWithExercises(result.lastInsertRowid));
});

// PUT /api/routines/:id
router.put('/:id', (req, res) => {
  const { name, notes } = req.body;
  db.prepare(`
    UPDATE routines SET name = COALESCE(?, name), notes = COALESCE(?, notes),
      updated_at = datetime('now') WHERE id = ?
  `).run(name ?? null, notes ?? null, req.params.id);
  res.json(getRoutineWithExercises(req.params.id));
});

// DELETE /api/routines/:id
router.delete('/:id', (req, res) => {
  // Cascade: remove exercises first, then the routine
  db.prepare('DELETE FROM routine_exercises WHERE routine_id = ?').run(req.params.id);
  db.prepare('DELETE FROM routines WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/routines/:id/exercises — add exercise to routine
router.post('/:id/exercises', (req, res) => {
  const {
    exercise_id, sets = 3, reps, duration_seconds,
    weight_value, weight_unit = 'lb', rest_seconds = 90
  } = req.body;
  if (!exercise_id) return res.status(400).json({ error: 'exercise_id is required' });

  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM routine_exercises WHERE routine_id = ?')
    .get(req.params.id);

  db.prepare(`
    INSERT INTO routine_exercises
      (routine_id, exercise_id, order_index, sets, reps, duration_seconds, weight_value, weight_unit, rest_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, exercise_id, maxOrder.m + 1, sets,
         reps ?? null, duration_seconds ?? null, weight_value ?? null, weight_unit, rest_seconds);

  res.status(201).json(getRoutineWithExercises(req.params.id));
});

// PUT /api/routines/exercises/:reId — update routine exercise
router.put('/exercises/:reId', (req, res) => {
  const { sets, reps, duration_seconds, weight_value, weight_unit, rest_seconds, order_index } = req.body;
  db.prepare(`
    UPDATE routine_exercises SET
      sets = COALESCE(?, sets), reps = COALESCE(?, reps),
      duration_seconds = COALESCE(?, duration_seconds),
      weight_value = COALESCE(?, weight_value), weight_unit = COALESCE(?, weight_unit),
      rest_seconds = COALESCE(?, rest_seconds), order_index = COALESCE(?, order_index)
    WHERE id = ?
  `).run(sets ?? null, reps ?? null, duration_seconds ?? null,
         weight_value ?? null, weight_unit ?? null, rest_seconds ?? null,
         order_index ?? null, req.params.reId);
  res.json({ ok: true });
});

// DELETE /api/routines/exercises/:reId
router.delete('/exercises/:reId', (req, res) => {
  db.prepare('DELETE FROM routine_exercises WHERE id = ?').run(req.params.reId);
  res.json({ ok: true });
});

module.exports = router;
