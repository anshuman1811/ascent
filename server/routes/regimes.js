const express = require('express');
const db = require('../db/index');
const router = express.Router();

function getRegimeWithDays(regimeId) {
  const regime = db.prepare('SELECT * FROM workout_regimes WHERE id = ?').get(regimeId);
  if (!regime) return null;
  const days = db.prepare(`
    SELECT rd.id, rd.day_index, rd.routine_id, r.name as routine_name
    FROM regime_days rd
    JOIN routines r ON r.id = rd.routine_id
    WHERE rd.regime_id = ?
    ORDER BY rd.day_index ASC
  `).all(regimeId);

  let nextDayIndex = null;
  let nextRoutineId = null;
  if (days.length > 0) {
    const routineIds = [...new Set(days.map(d => d.routine_id))];
    const placeholders = routineIds.map(() => '?').join(',');
    const completedCount = db.prepare(`
      SELECT COUNT(*) as c FROM workout_sessions
      WHERE user_id = ? AND status = 'completed' AND routine_id IN (${placeholders})
    `).get(regime.user_id, ...routineIds).c;
    nextDayIndex = completedCount % days.length;
    nextRoutineId = days[nextDayIndex].routine_id;
  }

  return { ...regime, days, next_day_index: nextDayIndex, next_routine_id: nextRoutineId };
}

// GET /api/regimes/user/:userId
router.get('/user/:userId', (req, res) => {
  const regimes = db.prepare('SELECT id FROM workout_regimes WHERE user_id = ? ORDER BY name ASC')
    .all(req.params.userId);
  res.json(regimes.map(r => getRegimeWithDays(r.id)));
});

// GET /api/regimes/:id
router.get('/:id', (req, res) => {
  const regime = getRegimeWithDays(req.params.id);
  if (!regime) return res.status(404).json({ error: 'Regime not found' });
  res.json(regime);
});

// POST /api/regimes — { user_id, name, notes, routine_ids: [ordered, can repeat] }
router.post('/', (req, res) => {
  const { user_id, name, notes, routine_ids = [] } = req.body;
  if (!user_id || !name) return res.status(400).json({ error: 'user_id and name are required' });

  const result = db.transaction(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO workout_regimes (user_id, name, notes) VALUES (?, ?, ?)')
      .run(user_id, name, notes ?? null);
    const insertDay = db.prepare('INSERT INTO regime_days (regime_id, day_index, routine_id) VALUES (?, ?, ?)');
    routine_ids.forEach((routineId, i) => insertDay.run(lastInsertRowid, i, routineId));
    return lastInsertRowid;
  })();

  res.status(201).json(getRegimeWithDays(result));
});

// PUT /api/regimes/:id — update name/notes and/or replace the day sequence
router.put('/:id', (req, res) => {
  const { name, notes, routine_ids } = req.body;

  db.transaction(() => {
    db.prepare(`
      UPDATE workout_regimes SET name = COALESCE(?, name), notes = COALESCE(?, notes),
        updated_at = datetime('now') WHERE id = ?
    `).run(name ?? null, notes ?? null, req.params.id);

    if (Array.isArray(routine_ids)) {
      db.prepare('DELETE FROM regime_days WHERE regime_id = ?').run(req.params.id);
      const insertDay = db.prepare('INSERT INTO regime_days (regime_id, day_index, routine_id) VALUES (?, ?, ?)');
      routine_ids.forEach((routineId, i) => insertDay.run(req.params.id, i, routineId));
    }
  })();

  res.json(getRegimeWithDays(req.params.id));
});

// DELETE /api/regimes/:id
router.delete('/:id', (req, res) => {
  // If this regime is currently active for any user, clear that reference first
  db.prepare('UPDATE user_profiles SET active_regime_id = NULL WHERE active_regime_id = ?').run(req.params.id);
  db.prepare('DELETE FROM regime_days WHERE regime_id = ?').run(req.params.id);
  db.prepare('DELETE FROM workout_regimes WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
