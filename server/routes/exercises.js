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
    name, exercise_type = 'reps',
    primary_muscles = [], secondary_muscles = [],
    met_value = 4.0, notes
  } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });

  const result = db.prepare(`
    INSERT INTO exercises (name, exercise_type, primary_muscles, secondary_muscles, met_value, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, exercise_type,
         JSON.stringify(primary_muscles), JSON.stringify(secondary_muscles),
         met_value, notes ?? null);

  res.status(201).json(parse(db.prepare('SELECT * FROM exercises WHERE id = ?').get(result.lastInsertRowid)));
});

// PUT /api/exercises/:id
router.put('/:id', (req, res) => {
  const { name, exercise_type, primary_muscles, secondary_muscles, met_value, notes } = req.body;
  db.prepare(`
    UPDATE exercises SET
      name = COALESCE(?, name),
      exercise_type = COALESCE(?, exercise_type),
      primary_muscles = COALESCE(?, primary_muscles),
      secondary_muscles = COALESCE(?, secondary_muscles),
      met_value = COALESCE(?, met_value),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(name ?? null, exercise_type ?? null,
         primary_muscles ? JSON.stringify(primary_muscles) : null,
         secondary_muscles ? JSON.stringify(secondary_muscles) : null,
         met_value ?? null, notes ?? null, req.params.id);

  res.json(parse(db.prepare('SELECT * FROM exercises WHERE id = ?').get(req.params.id)));
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
