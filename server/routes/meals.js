const express = require('express');
const db = require('../db/index');
const router = express.Router();

function r(v) { return Math.round((v || 0) * 10) / 10; }

function computeItemMacros(food, quantity) {
  const scale = quantity / food.serving_size;
  return {
    calories:        r(food.calories        * scale),
    protein_g:       r(food.protein_g       * scale),
    carbs_g:         r(food.carbs_g         * scale),
    fat_g:           r(food.fat_g           * scale),
    saturated_fat_g: r(food.saturated_fat_g * scale),
    fiber_g:         r(food.fiber_g         * scale),
    sugar_g:         r(food.sugar_g         * scale),
    // added_sugar_g is nullable — NULL means "unknown", not zero
    added_sugar_g:   food.added_sugar_g != null ? r(food.added_sugar_g * scale) : null,
    cholesterol_mg:  r(food.cholesterol_mg  * scale),
    sodium_mg:       r(food.sodium_mg       * scale),
    potassium_mg:    r(food.potassium_mg    * scale),
  };
}

function sumMacros(items) {
  return items.reduce((acc, i) => ({
    calories:        acc.calories        + (i.calories        || 0),
    protein_g:       acc.protein_g       + (i.protein_g       || 0),
    carbs_g:         acc.carbs_g         + (i.carbs_g         || 0),
    fat_g:           acc.fat_g           + (i.fat_g           || 0),
    saturated_fat_g: acc.saturated_fat_g + (i.saturated_fat_g || 0),
    fiber_g:         acc.fiber_g         + (i.fiber_g         || 0),
    sugar_g:         acc.sugar_g         + (i.sugar_g         || 0),
    added_sugar_g:   (acc.added_sugar_g || 0) + (i.added_sugar_g || 0),
    cholesterol_mg:  acc.cholesterol_mg  + (i.cholesterol_mg  || 0),
    sodium_mg:       acc.sodium_mg       + (i.sodium_mg       || 0),
    potassium_mg:    acc.potassium_mg    + (i.potassium_mg    || 0),
  }), { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, saturated_fat_g: 0,
        fiber_g: 0, sugar_g: 0, added_sugar_g: 0, cholesterol_mg: 0, sodium_mg: 0, potassium_mg: 0 });
}

function getMealWithItems(mealId) {
  const meal = db.prepare('SELECT * FROM meals WHERE id = ?').get(mealId);
  if (!meal) return null;
  const items = db.prepare(`
    SELECT mi.*, f.name as food_name, f.brand, f.serving_size, f.serving_unit
    FROM meal_items mi
    JOIN foods f ON f.id = mi.food_id
    WHERE mi.meal_id = ?
  `).all(mealId);
  return { ...meal, items, totals: sumMacros(items) };
}

// GET /api/meals/user/:userId?date=YYYY-MM-DD
router.get('/user/:userId', (req, res) => {
  const { date } = req.query;
  const where = date ? `AND date(m.logged_at) = ?` : '';
  const params = date ? [req.params.userId, date] : [req.params.userId];

  const meals = db.prepare(`
    SELECT m.id FROM meals m
    WHERE m.user_id = ? ${where}
    ORDER BY m.logged_at ASC
  `).all(...params);

  const result = meals.map(r => getMealWithItems(r.id));
  res.json(result);
});

// POST /api/meals — create a meal
router.post('/', (req, res) => {
  const { user_id, meal_type = 'snack', notes, logged_at } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  const result = db.prepare(`
    INSERT INTO meals (user_id, meal_type, notes, logged_at)
    VALUES (?, ?, ?, COALESCE(?, datetime('now', 'localtime')))
  `).run(user_id, meal_type, notes ?? null, logged_at ?? null);

  res.status(201).json(getMealWithItems(result.lastInsertRowid));
});

// PUT /api/meals/:id
router.put('/:id', (req, res) => {
  const { meal_type, notes, logged_at } = req.body;
  db.prepare(`
    UPDATE meals SET
      meal_type = COALESCE(?, meal_type),
      notes = COALESCE(?, notes),
      logged_at = COALESCE(?, logged_at)
    WHERE id = ?
  `).run(meal_type ?? null, notes ?? null, logged_at ?? null, req.params.id);
  res.json(getMealWithItems(req.params.id));
});

// DELETE /api/meals/:id
router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// POST /api/meals/:id/items — add food to meal
router.post('/:id/items', (req, res) => {
  const { food_id, quantity } = req.body;
  if (!food_id || !quantity) return res.status(400).json({ error: 'food_id and quantity are required' });

  const food = db.prepare('SELECT * FROM foods WHERE id = ?').get(food_id);
  if (!food) return res.status(404).json({ error: 'Food not found' });

  const macros = computeItemMacros(food, quantity);

  const result = db.prepare(`
    INSERT INTO meal_items
      (meal_id, food_id, quantity, calories, protein_g, carbs_g, fat_g, saturated_fat_g, fiber_g, sugar_g, added_sugar_g, cholesterol_mg, sodium_mg, potassium_mg)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, food_id, quantity,
         macros.calories, macros.protein_g, macros.carbs_g, macros.fat_g,
         macros.saturated_fat_g, macros.fiber_g, macros.sugar_g, macros.added_sugar_g,
         macros.cholesterol_mg, macros.sodium_mg, macros.potassium_mg);

  const item = db.prepare(`
    SELECT mi.*, f.name as food_name, f.brand, f.serving_size, f.serving_unit
    FROM meal_items mi JOIN foods f ON f.id = mi.food_id
    WHERE mi.id = ?
  `).get(result.lastInsertRowid);

  res.status(201).json(item);
});

// PUT /api/meals/items/:itemId — update quantity, or override macros directly for this logged entry
router.put('/items/:itemId', (req, res) => {
  const { quantity, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g } = req.body;
  const hasOverride = [calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g].some(v => v != null);

  const item = db.prepare(`
    SELECT mi.*, f.serving_size, f.calories as f_calories, f.protein_g as f_protein_g,
      f.carbs_g as f_carbs_g, f.fat_g as f_fat_g, f.saturated_fat_g, f.fiber_g as f_fiber_g,
      f.sugar_g as f_sugar_g, f.cholesterol_mg, f.sodium_mg, f.potassium_mg
    FROM meal_items mi JOIN foods f ON f.id = mi.food_id
    WHERE mi.id = ?
  `).get(req.params.itemId);

  if (!item) return res.status(404).json({ error: 'Item not found' });

  const newQty = quantity ?? item.quantity;
  const macros = hasOverride
    ? {
        calories:        calories    ?? item.calories,
        protein_g:        protein_g   ?? item.protein_g,
        carbs_g:          carbs_g     ?? item.carbs_g,
        fat_g:            fat_g       ?? item.fat_g,
        saturated_fat_g:  item.saturated_fat_g,
        fiber_g:          fiber_g     ?? item.fiber_g,
        sugar_g:          sugar_g     ?? item.sugar_g,
        cholesterol_mg:   item.cholesterol_mg,
        sodium_mg:        item.sodium_mg,
        potassium_mg:     item.potassium_mg,
      }
    : computeItemMacros({
        serving_size: item.serving_size, calories: item.f_calories, protein_g: item.f_protein_g,
        carbs_g: item.f_carbs_g, fat_g: item.f_fat_g, saturated_fat_g: item.saturated_fat_g,
        fiber_g: item.f_fiber_g, sugar_g: item.f_sugar_g, cholesterol_mg: item.cholesterol_mg,
        sodium_mg: item.sodium_mg, potassium_mg: item.potassium_mg,
      }, newQty);

  db.prepare(`
    UPDATE meal_items SET quantity = ?, calories = ?, protein_g = ?, carbs_g = ?,
      fat_g = ?, saturated_fat_g = ?, fiber_g = ?, sugar_g = ?,
      cholesterol_mg = ?, sodium_mg = ?, potassium_mg = ?
    WHERE id = ?
  `).run(newQty, macros.calories, macros.protein_g, macros.carbs_g,
         macros.fat_g, macros.saturated_fat_g, macros.fiber_g, macros.sugar_g,
         macros.cholesterol_mg, macros.sodium_mg, macros.potassium_mg, req.params.itemId);

  res.json({ ok: true, quantity: newQty, ...macros });
});

// DELETE /api/meals/items/:itemId
router.delete('/items/:itemId', (req, res) => {
  db.prepare('DELETE FROM meal_items WHERE id = ?').run(req.params.itemId);
  res.json({ ok: true });
});

// GET /api/meals/user/:userId/recent-items?limit=30
// Returns the most recently logged food items (distinct food_id, latest quantity/unit)
// with the meal date and type for context — used for the "quick re-log from recent" feature.
router.get('/user/:userId/recent-items', (req, res) => {
  const { limit = 30 } = req.query;
  const rows = db.prepare(`
    SELECT
      mi.id as item_id,
      mi.food_id,
      mi.quantity,
      mi.calories,
      mi.protein_g,
      mi.carbs_g,
      mi.fat_g,
      mi.fiber_g,
      mi.sugar_g,
      f.name as food_name,
      f.serving_size,
      f.serving_unit,
      f.calories as food_calories_per_serving,
      m.meal_type,
      date(m.logged_at) as meal_date,
      m.logged_at
    FROM meal_items mi
    JOIN meals m ON m.id = mi.meal_id
    JOIN foods f ON f.id = mi.food_id
    WHERE m.user_id = ?
    ORDER BY m.logged_at DESC
    LIMIT ?
  `).all(req.params.userId, Number(limit));

  // Deduplicate: keep only the most recent entry per food_id
  const seen = new Set();
  const deduped = rows.filter(r => {
    if (seen.has(r.food_id)) return false;
    seen.add(r.food_id);
    return true;
  });

  res.json(deduped);
});

module.exports = router;
