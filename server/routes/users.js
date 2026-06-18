const express = require('express');
const db = require('../db/index');
const router = express.Router();

function parseUserProfile(user) {
  if (user && user.tracked_macros) {
    try { user.tracked_macros = JSON.parse(user.tracked_macros); } catch { user.tracked_macros = null; }
  }
  return user;
}

const USER_PROFILE_SELECT = `
  SELECT u.id, u.name, u.avatar_color, u.created_at,
    p.birth_date, p.sex, p.height_value, p.height_unit,
    p.activity_level, p.calorie_target, p.tdee_estimate,
    p.protein_target_g, p.carbs_target_g, p.fat_target_g, p.fiber_target_g, p.sugar_target_g,
    p.sodium_target_mg, p.added_sugar_target_g, p.saturated_fat_target_g,
    p.cholesterol_target_mg, p.potassium_target_mg, p.tracked_macros,
    p.weight_goal_type, p.target_weight_value, p.target_weight_unit,
    p.weight_unit, p.volume_unit, p.length_unit
  FROM users u
  LEFT JOIN user_profiles p ON p.user_id = u.id
`;

// GET /api/users — list both users with their profiles
router.get('/', (req, res) => {
  const users = db.prepare(USER_PROFILE_SELECT + ' ORDER BY u.id').all();
  res.json(users.map(parseUserProfile));
});

// GET /api/users/:id
router.get('/:id', (req, res) => {
  const user = db.prepare(USER_PROFILE_SELECT + ' WHERE u.id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(parseUserProfile(user));
});

// PUT /api/users/:id — update name/avatar
router.put('/:id', (req, res) => {
  const { name, avatar_color } = req.body;
  db.prepare(`UPDATE users SET name = COALESCE(?, name), avatar_color = COALESCE(?, avatar_color) WHERE id = ?`)
    .run(name ?? null, avatar_color ?? null, req.params.id);
  res.json({ ok: true });
});

// PUT /api/users/:id/profile — update targets and preferences
router.put('/:id/profile', (req, res) => {
  const {
    birth_date, sex, height_value, height_unit, activity_level,
    calorie_target, tdee_estimate, protein_target_g, carbs_target_g,
    fat_target_g, fiber_target_g, sugar_target_g, sodium_target_mg,
    added_sugar_target_g, saturated_fat_target_g, cholesterol_target_mg, potassium_target_mg,
    tracked_macros, weight_goal_type, target_weight_value,
    target_weight_unit, weight_unit, volume_unit, length_unit
  } = req.body;

  // Accept tracked_macros as an array (from client) or a JSON string; store as JSON string
  const trackedMacrosStr = tracked_macros != null
    ? (Array.isArray(tracked_macros) ? JSON.stringify(tracked_macros) : tracked_macros)
    : null;

  db.prepare(`
    UPDATE user_profiles SET
      birth_date = COALESCE(?, birth_date),
      sex = COALESCE(?, sex),
      height_value = COALESCE(?, height_value),
      height_unit = COALESCE(?, height_unit),
      activity_level = COALESCE(?, activity_level),
      calorie_target = COALESCE(?, calorie_target),
      tdee_estimate = COALESCE(?, tdee_estimate),
      protein_target_g = COALESCE(?, protein_target_g),
      carbs_target_g = COALESCE(?, carbs_target_g),
      fat_target_g = COALESCE(?, fat_target_g),
      fiber_target_g = COALESCE(?, fiber_target_g),
      sugar_target_g = COALESCE(?, sugar_target_g),
      sodium_target_mg = COALESCE(?, sodium_target_mg),
      added_sugar_target_g = COALESCE(?, added_sugar_target_g),
      saturated_fat_target_g = COALESCE(?, saturated_fat_target_g),
      cholesterol_target_mg = COALESCE(?, cholesterol_target_mg),
      potassium_target_mg = COALESCE(?, potassium_target_mg),
      tracked_macros = COALESCE(?, tracked_macros),
      weight_goal_type = COALESCE(?, weight_goal_type),
      target_weight_value = COALESCE(?, target_weight_value),
      target_weight_unit = COALESCE(?, target_weight_unit),
      weight_unit = COALESCE(?, weight_unit),
      volume_unit = COALESCE(?, volume_unit),
      length_unit = COALESCE(?, length_unit),
      updated_at = datetime('now')
    WHERE user_id = ?
  `).run(
    birth_date ?? null, sex ?? null, height_value ?? null, height_unit ?? null,
    activity_level ?? null, calorie_target ?? null, tdee_estimate ?? null,
    protein_target_g ?? null, carbs_target_g ?? null, fat_target_g ?? null,
    fiber_target_g ?? null, sugar_target_g ?? null,
    sodium_target_mg ?? null, added_sugar_target_g ?? null,
    saturated_fat_target_g ?? null, cholesterol_target_mg ?? null, potassium_target_mg ?? null,
    trackedMacrosStr,
    weight_goal_type ?? null, target_weight_value ?? null,
    target_weight_unit ?? null, weight_unit ?? null, volume_unit ?? null,
    length_unit ?? null, req.params.id
  );
  res.json({ ok: true });
});

// GET /api/users/:id/weight-log
router.get('/:id/weight-log', (req, res) => {
  const { limit = 90 } = req.query;
  const rows = db.prepare(`
    SELECT * FROM weight_log WHERE user_id = ?
    ORDER BY logged_at DESC LIMIT ?
  `).all(req.params.id, Number(limit));
  res.json(rows);
});

// POST /api/users/:id/weight-log
router.post('/:id/weight-log', (req, res) => {
  const { weight_value, weight_unit = 'lb', logged_at } = req.body;
  const result = db.prepare(`
    INSERT INTO weight_log (user_id, weight_value, weight_unit, logged_at)
    VALUES (?, ?, ?, COALESCE(?, datetime('now')))
  `).run(req.params.id, weight_value, weight_unit, logged_at ?? null);
  res.status(201).json({ id: result.lastInsertRowid });
});

// DELETE /api/users/:id/weight-log/:logId
router.delete('/:id/weight-log/:logId', (req, res) => {
  db.prepare('DELETE FROM weight_log WHERE id = ? AND user_id = ?')
    .run(req.params.logId, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
