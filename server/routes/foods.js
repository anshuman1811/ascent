const express = require('express');
const db = require('../db/index');
const router = express.Router();

// GET /api/foods?search=&limit=
router.get('/', (req, res) => {
  const { search = '', limit = 100 } = req.query;
  const rows = db.prepare(`
    SELECT * FROM foods
    WHERE name LIKE ? OR brand LIKE ?
    ORDER BY name ASC LIMIT ?
  `).all(`%${search}%`, `%${search}%`, Number(limit));
  res.json(rows);
});

// GET /api/foods/:id
router.get('/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM foods WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Food not found' });
  res.json(row);
});

// POST /api/foods
router.post('/', (req, res) => {
  const {
    name, brand, serving_size = 1, serving_unit = 'serving',
    calories = 0, protein_g = 0, carbs_g = 0, fat_g = 0,
    fiber_g = 0, sugar_g = 0, created_by
  } = req.body;

  if (!name) return res.status(400).json({ error: 'name is required' });

  const result = db.prepare(`
    INSERT INTO foods (name, brand, serving_size, serving_unit, calories, protein_g,
      carbs_g, fat_g, fiber_g, sugar_g, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, brand ?? null, serving_size, serving_unit, calories, protein_g,
         carbs_g, fat_g, fiber_g, sugar_g, created_by ?? null);

  res.status(201).json(db.prepare('SELECT * FROM foods WHERE id = ?').get(result.lastInsertRowid));
});

// PUT /api/foods/:id
router.put('/:id', (req, res) => {
  const {
    name, brand, serving_size, serving_unit,
    calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g
  } = req.body;

  db.prepare(`
    UPDATE foods SET
      name = COALESCE(?, name),
      brand = COALESCE(?, brand),
      serving_size = COALESCE(?, serving_size),
      serving_unit = COALESCE(?, serving_unit),
      calories = COALESCE(?, calories),
      protein_g = COALESCE(?, protein_g),
      carbs_g = COALESCE(?, carbs_g),
      fat_g = COALESCE(?, fat_g),
      fiber_g = COALESCE(?, fiber_g),
      sugar_g = COALESCE(?, sugar_g),
      updated_at = datetime('now')
    WHERE id = ?
  `).run(name ?? null, brand ?? null, serving_size ?? null, serving_unit ?? null,
         calories ?? null, protein_g ?? null, carbs_g ?? null, fat_g ?? null,
         fiber_g ?? null, sugar_g ?? null, req.params.id);

  res.json(db.prepare('SELECT * FROM foods WHERE id = ?').get(req.params.id));
});

// DELETE /api/foods/:id
router.delete('/:id', (req, res) => {
  // Check if used in any meal_items
  const inUse = db.prepare('SELECT COUNT(*) as c FROM meal_items WHERE food_id = ?').get(req.params.id);
  if (inUse.c > 0) {
    return res.status(409).json({ error: 'Food is used in meal logs and cannot be deleted' });
  }
  db.prepare('DELETE FROM foods WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
