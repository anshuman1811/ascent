const express = require('express');
const db = require('../db/index');
const router = express.Router();

const parse = row => row ? {
  ...row,
  primary_muscles: JSON.parse(row.primary_muscles || '[]'),
  secondary_muscles: JSON.parse(row.secondary_muscles || '[]'),
} : null;

// GET /api/exercises?search=&type=
router.get('/', (req, res) => {
  const { search = '', type } = req.query;
  const typeFilter = type ? 'AND exercise_type = ?' : '';
  const params = type ? [`%${search}%`, type] : [`%${search}%`];
  const rows = db.prepare(`
    SELECT * FROM exercises
    WHERE name LIKE ? ${typeFilter}
    ORDER BY name ASC
  `).all(...params);
  res.json(rows.map(parse));
});

// GET /api/exercises/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Exercise not found' });
  res.json(parse(row));
});

// POST /api/exercises
router.post('/', (req, res) => {
  const {
    name, exercise_type = 'reps', category = 'strength',
    primary_muscles = [], secondary_muscles = [],
    met_value = 4.0, notes, description, gif_url
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const result = db.prepare(`
    INSERT INTO exercises (name, exercise_type, category, primary_muscles, secondary_muscles, met_value, notes, description, gif_url)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, exercise_type, category,
         JSON.stringify(primary_muscles), JSON.stringify(secondary_muscles),
         met_value, notes ?? null, description ?? null, gif_url ?? null);

  res.status(201).json(parse(db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid)));
});

// PUT /api/exercises/:id
router.put('/:id', (req, res) => {
  const { name, exercise_type, category, primary_muscles, secondary_muscles, met_value, notes, description, gif_url } = req.body;
  db.prepare(`
    UPDATE exercises SET
      name = COALESCE(?, name),
      exercise_type = COALESCE(?, exercise_type),
      category = COALESCE(?, category),
      primary_muscles = COALESCE(?, primary_muscles),
      secondary_muscles = COALESCE(?, secondary_muscles),
      met_value = COALESCE(?, met_value),
      notes = COALESCE(?, notes),
      description = ?,
      gif_url = ?
    WHERE id = ?
  `).run(name ?? null, exercise_type ?? null, category ?? null,
         primary_muscles ? JSON.stringify(primary_muscles) : null,
         secondary_muscles ? JSON.stringify(secondary_muscles) : null,
         met_value ?? null, notes ?? null,
         description !== undefined ? description : db.prepare('SELECT description FROM exercises WHERE id = ?').get(req.params.id)?.description,
         gif_url !== undefined ? gif_url : db.prepare('SELECT gif_url FROM exercises WHERE id = ?').get(req.params.id)?.gif_url,
         req.params.id);

  res.json(parse(db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id)));
});

// GET /api/exercises/:id/history?user_id=1&current_session_id=5
// Returns the most recent completed session's sets + all PBs for this exercise/user
router.get('/:id/history', (req, res) => {
  const { user_id, current_session_id } = req.query;
  if (!user_id) return res.status(400).json({ error: 'user_id required' });

  // Most recent completed session containing this exercise (excluding current)
  const lastSession = db.prepare(`
    SELECT ws.id, ws.completed_at, ws.name as session_name
    FROM workout_sessions ws
    JOIN session_exercises se ON se.session_id = ws.id
    WHERE se.exercise_id = ? AND ws.user_id = ? AND ws.status = 'completed'
      AND ws.id != COALESCE(CAST(? AS INTEGER), -1)
    ORDER BY ws.completed_at DESC
    LIMIT 1
  `).get(req.params.id, user_id, current_session_id ?? null);

  let last_sets = [];
  if (lastSession) {
    last_sets = db.prepare(`
      SELECT sl.set_number, sl.actual_reps, sl.actual_duration_seconds,
             sl.actual_weight_value, sl.actual_weight_unit, sl.is_pb
      FROM set_logs sl
      JOIN session_exercises se ON se.id = sl.session_exercise_id
      WHERE se.session_id = ? AND se.exercise_id = ?
      ORDER BY sl.set_number ASC
    `).all(lastSession.id, req.params.id);
  }

  // All PBs for this exercise (per rep count)
  const pbs = db.prepare(`
    SELECT rep_count, weight_value, weight_unit, duration_seconds, achieved_at
    FROM personal_bests
    WHERE exercise_id = ? AND user_id = ?
    ORDER BY rep_count ASC
  `).all(req.params.id, user_id);

  res.json({
    last_session: lastSession ?? null,
    last_sets,
    pbs,
  });
});

// DELETE /api/exercises/:id
router.delete('/:id', (req, res) => {
  const inUse = db.prepare(`
    SELECT COUNT(*) as c FROM routine_exercises WHERE exercise_id = ?
  `).get(req.params.id);
  if (inUse.c > 0) {
    return res.status(409).json({ error: 'Exercise is used in routines and cannot be deleted' });
  }
  db.prepare('DELETE FROM exercises WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
