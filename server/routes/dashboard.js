const express = require('express');
const db = require('../db/index');
const router = express.Router();

function classifyCalories(net, target, buffer = 50) {
  if (net < target - buffer) return 'deficit';
  if (net > target + buffer) return 'surplus';
  return 'maintenance';
}

// GET /api/dashboard/:userId/daily?date=YYYY-MM-DD
router.get('/:userId/daily', (req, res) => {
  const { date = new Date().toISOString().split('T')[0] } = req.query;
  const userId = req.params.userId;

  const profile = db.prepare(`
    SELECT calorie_target, protein_target_g, carbs_target_g, fat_target_g,
      fiber_target_g, sodium_target_mg, weight_unit
    FROM user_profiles WHERE user_id = ?
  `).get(userId);

  // Meal totals for the day
  const mealTotals = db.prepare(`
    SELECT
      COALESCE(SUM(mi.calories),        0) as calories,
      COALESCE(SUM(mi.protein_g),       0) as protein_g,
      COALESCE(SUM(mi.carbs_g),         0) as carbs_g,
      COALESCE(SUM(mi.fat_g),           0) as fat_g,
      COALESCE(SUM(mi.saturated_fat_g), 0) as saturated_fat_g,
      COALESCE(SUM(mi.fiber_g),         0) as fiber_g,
      COALESCE(SUM(mi.sugar_g),         0) as sugar_g,
      COALESCE(SUM(mi.cholesterol_mg),  0) as cholesterol_mg,
      COALESCE(SUM(mi.sodium_mg),       0) as sodium_mg,
      COALESCE(SUM(mi.potassium_mg),    0) as potassium_mg
    FROM meals m
    JOIN meal_items mi ON mi.meal_id = m.id
    WHERE m.user_id = ? AND date(m.logged_at) = ?
  `).get(userId, date);

  // Exercise calories burned for the day
  const exerciseTotals = db.prepare(`
    SELECT
      COALESCE(SUM(ws.calories_burned), 0) as calories_burned,
      COUNT(*) as session_count
    FROM workout_sessions ws
    WHERE ws.user_id = ? AND date(ws.started_at) = ? AND ws.status = 'completed'
  `).get(userId, date);

  // Meal breakdown by type
  const mealBreakdown = db.prepare(`
    SELECT m.meal_type,
      COALESCE(SUM(mi.calories),  0) as calories,
      COALESCE(SUM(mi.protein_g), 0) as protein_g,
      COALESCE(SUM(mi.carbs_g),   0) as carbs_g,
      COALESCE(SUM(mi.fat_g),     0) as fat_g
    FROM meals m
    JOIN meal_items mi ON mi.meal_id = m.id
    WHERE m.user_id = ? AND date(m.logged_at) = ?
    GROUP BY m.meal_type
  `).all(userId, date);

  const netCalories = mealTotals.calories - exerciseTotals.calories_burned;
  const classification = profile?.calorie_target
    ? classifyCalories(netCalories, profile.calorie_target)
    : null;

  // Latest body weight
  const latestWeight = db.prepare(`
    SELECT weight_value, weight_unit FROM weight_log
    WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1
  `).get(userId);

  res.json({
    date,
    meals: mealTotals,
    exercise: exerciseTotals,
    net_calories: Math.round(netCalories * 10) / 10,
    classification,
    meal_breakdown: mealBreakdown,
    targets: profile || {},
    latest_weight: latestWeight || null,
  });
});

// GET /api/dashboard/:userId/weekly?date=YYYY-MM-DD (week ending on date)
router.get('/:userId/weekly', (req, res) => {
  const { date = new Date().toISOString().split('T')[0] } = req.query;
  const userId = req.params.userId;

  const days = db.prepare(`
    WITH RECURSIVE dates(d) AS (
      SELECT date(?, '-6 days')
      UNION ALL SELECT date(d, '+1 day') FROM dates WHERE d < ?
    )
    SELECT d as date FROM dates
  `).all(date, date);

  const profile = db.prepare('SELECT calorie_target FROM user_profiles WHERE user_id = ?').get(userId);

  const result = days.map(({ date: d }) => {
    const meals = db.prepare(`
      SELECT COALESCE(SUM(mi.calories), 0) as calories,
        COALESCE(SUM(mi.protein_g), 0) as protein_g,
        COALESCE(SUM(mi.carbs_g), 0) as carbs_g,
        COALESCE(SUM(mi.fat_g), 0) as fat_g
      FROM meals m JOIN meal_items mi ON mi.meal_id = m.id
      WHERE m.user_id = ? AND date(m.logged_at) = ?
    `).get(userId, d);

    const exercise = db.prepare(`
      SELECT COALESCE(SUM(calories_burned), 0) as calories_burned
      FROM workout_sessions WHERE user_id = ? AND date(started_at) = ? AND status = 'completed'
    `).get(userId, d);

    const net = meals.calories - exercise.calories_burned;
    return {
      date: d,
      calories_in: Math.round(meals.calories),
      calories_burned: Math.round(exercise.calories_burned),
      net_calories: Math.round(net),
      protein_g: Math.round(meals.protein_g),
      carbs_g: Math.round(meals.carbs_g),
      fat_g: Math.round(meals.fat_g),
      classification: profile?.calorie_target ? classifyCalories(net, profile.calorie_target) : null,
    };
  });

  res.json(result);
});

// GET /api/dashboard/:userId/monthly?month=YYYY-MM
router.get('/:userId/monthly', (req, res) => {
  const { month = new Date().toISOString().slice(0, 7) } = req.query;
  const userId = req.params.userId;

  const summary = db.prepare(`
    SELECT
      COUNT(*) as days_logged,
      COALESCE(AVG(calories), 0) as avg_calories,
      COALESCE(AVG(protein_g), 0) as avg_protein_g
    FROM (
      SELECT date(m.logged_at) as day,
        SUM(mi.calories) as calories,
        SUM(mi.protein_g) as protein_g
      FROM meals m JOIN meal_items mi ON mi.meal_id = m.id
      WHERE m.user_id = ? AND strftime('%Y-%m', m.logged_at) = ?
      GROUP BY day
    ) daily
  `).get(userId, month);

  // Weight trend for month
  const weightLog = db.prepare(`
    SELECT weight_value, weight_unit, date(logged_at) as date
    FROM weight_log WHERE user_id = ? AND strftime('%Y-%m', logged_at) = ?
    ORDER BY logged_at ASC
  `).all(userId, month);

  // Workout consistency
  const workoutDays = db.prepare(`
    SELECT COUNT(DISTINCT date(started_at)) as days
    FROM workout_sessions WHERE user_id = ? AND strftime('%Y-%m', started_at) = ? AND status = 'completed'
  `).get(userId, month);

  res.json({ month, summary, weight_log: weightLog, workout_days: workoutDays.days });
});

module.exports = router;
