const express = require('express');
const db = require('../db/index');
const router = express.Router();

function toKg(value, unit) { return unit === 'lb' ? value * 0.453592 : value; }

function getSession(sessionId) {
  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  const exercises = db.prepare(`
    SELECT se.*, e.name as exercise_name, e.exercise_type, e.primary_muscles,
      e.secondary_muscles, e.met_value
    FROM session_exercises se
    JOIN exercises e ON e.id = se.exercise_id
    WHERE se.session_id = ?
    ORDER BY se.order_index ASC
  `).all(sessionId).map(se => {
    const sets = db.prepare('SELECT * FROM set_logs WHERE session_exercise_id = ? ORDER BY set_number ASC')
      .all(se.id);
    return {
      ...se,
      primary_muscles: JSON.parse(se.primary_muscles || '[]'),
      secondary_muscles: JSON.parse(se.secondary_muscles || '[]'),
      sets,
    };
  });
  return { ...session, exercises };
}

function checkAndUpdatePB(userId, exerciseId, sessionId, actualReps, actualDurationSecs, weightValue, weightUnit) {
  let isPB = false;

  if (actualReps && weightValue) {
    const existing = db.prepare(`
      SELECT * FROM personal_bests WHERE user_id = ? AND exercise_id = ? AND rep_count = ?
    `).get(userId, exerciseId, actualReps);

    const newKg = toKg(weightValue, weightUnit);
    const existingKg = existing ? toKg(existing.weight_value, existing.weight_unit) : -1;

    if (newKg > existingKg) {
      isPB = true;
      db.prepare(`
        INSERT INTO personal_bests (user_id, exercise_id, rep_count, weight_value, weight_unit, achieved_at, session_id)
        VALUES (?, ?, ?, ?, ?, datetime('now'), ?)
        ON CONFLICT(user_id, exercise_id, rep_count) DO UPDATE SET
          weight_value = excluded.weight_value, weight_unit = excluded.weight_unit,
          achieved_at = excluded.achieved_at, session_id = excluded.session_id
      `).run(userId, exerciseId, actualReps, weightValue, weightUnit, sessionId);
    }
  } else if (actualDurationSecs) {
    const existing = db.prepare(`
      SELECT * FROM personal_bests WHERE user_id = ? AND exercise_id = ? AND rep_count IS NULL
    `).get(userId, exerciseId);

    if (!existing || actualDurationSecs > existing.duration_seconds) {
      isPB = true;
      if (existing) {
        db.prepare(`
          UPDATE personal_bests SET duration_seconds = ?, achieved_at = datetime('now'), session_id = ?
          WHERE id = ?
        `).run(actualDurationSecs, sessionId, existing.id);
      } else {
        db.prepare(`
          INSERT INTO personal_bests (user_id, exercise_id, duration_seconds, achieved_at, session_id)
          VALUES (?, ?, ?, datetime('now'), ?)
        `).run(userId, exerciseId, actualDurationSecs, sessionId);
      }
    }
  }

  return isPB;
}

// GET /api/workouts/user/:userId — list sessions
router.get('/user/:userId', (req, res) => {
  const { status, limit = 20 } = req.query;
  const filter = status ? 'AND status = ?' : '';
  const params = status ? [req.params.userId, status, Number(limit)] : [req.params.userId, Number(limit)];
  const sessions = db.prepare(`
    SELECT ws.*, r.name as routine_name
    FROM workout_sessions ws
    LEFT JOIN routines r ON r.id = ws.routine_id
    WHERE ws.user_id = ? ${filter}
    ORDER BY ws.started_at DESC LIMIT ?
  `).all(...params);
  res.json(sessions);
});

// GET /api/workouts/:id — full session with exercises and sets
router.get('/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json(session);
});

// GET /api/workouts/user/:userId/active — get in-progress session
router.get('/user/:userId/active', (req, res) => {
  const row = db.prepare(`
    SELECT id FROM workout_sessions WHERE user_id = ? AND status = 'in_progress'
    ORDER BY started_at DESC LIMIT 1
  `).get(req.params.userId);
  res.json(row ? getSession(row.id) : null);
});

// POST /api/workouts/start — start a new session
router.post('/start', (req, res) => {
  const { user_id, routine_id, name } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  // Abandon any existing in-progress session
  db.prepare(`UPDATE workout_sessions SET status = 'abandoned', completed_at = datetime('now')
    WHERE user_id = ? AND status = 'in_progress'`).run(user_id);

  let sessionName = name;
  let exercises = [];

  if (routine_id) {
    const routine = db.prepare('SELECT * FROM routines WHERE id = ?').get(routine_id);
    sessionName = sessionName || routine?.name || 'Workout';
    exercises = db.prepare(`
      SELECT re.*, e.exercise_type FROM routine_exercises re
      JOIN exercises e ON e.id = re.exercise_id
      WHERE re.routine_id = ? ORDER BY re.order_index ASC
    `).all(routine_id);
  } else {
    sessionName = sessionName || 'Ad-hoc Workout';
  }

  const session = db.prepare(`
    INSERT INTO workout_sessions (user_id, routine_id, name)
    VALUES (?, ?, ?)
  `).run(user_id, routine_id ?? null, sessionName);

  const sessionId = session.lastInsertRowid;

  if (exercises.length > 0) {
    const insEx = db.prepare(`
      INSERT INTO session_exercises
        (session_id, exercise_id, order_index, target_sets, target_reps,
         target_duration_seconds, target_weight_value, target_weight_unit, rest_seconds)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    db.transaction(() => {
      exercises.forEach((ex, i) => {
        insEx.run(sessionId, ex.exercise_id, i, ex.sets, ex.reps ?? null,
                  ex.duration_seconds ?? null, ex.weight_value ?? null,
                  ex.weight_unit, ex.rest_seconds);
      });
    })();
  }

  res.status(201).json(getSession(sessionId));
});

// POST /api/workouts/:id/exercises — add ad-hoc exercise to running session
router.post('/:id/exercises', (req, res) => {
  const {
    exercise_id, target_sets = 3, target_reps, target_duration_seconds,
    target_weight_value, target_weight_unit = 'lb', rest_seconds = 90
  } = req.body;
  if (!exercise_id) return res.status(400).json({ error: 'exercise_id is required' });

  const maxOrder = db.prepare('SELECT COALESCE(MAX(order_index), -1) as m FROM session_exercises WHERE session_id = ?')
    .get(req.params.id);

  db.prepare(`
    INSERT INTO session_exercises
      (session_id, exercise_id, order_index, target_sets, target_reps,
       target_duration_seconds, target_weight_value, target_weight_unit, rest_seconds)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.id, exercise_id, maxOrder.m + 1, target_sets,
         target_reps ?? null, target_duration_seconds ?? null,
         target_weight_value ?? null, target_weight_unit, rest_seconds);

  res.status(201).json(getSession(req.params.id));
});

// POST /api/workouts/session-exercises/:seId/sets — log a set
router.post('/session-exercises/:seId/sets', (req, res) => {
  const { actual_reps, actual_duration_seconds, actual_weight_value, actual_weight_unit = 'lb' } = req.body;

  const se = db.prepare(`
    SELECT se.*, ws.user_id FROM session_exercises se
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE se.id = ?
  `).get(req.params.seId);
  if (!se) return res.status(404).json({ error: 'Session exercise not found' });

  const setNumber = (db.prepare('SELECT COUNT(*) as c FROM set_logs WHERE session_exercise_id = ?')
    .get(req.params.seId).c) + 1;

  const isPB = checkAndUpdatePB(
    se.user_id, se.exercise_id, se.session_id,
    actual_reps ?? null, actual_duration_seconds ?? null,
    actual_weight_value ?? null, actual_weight_unit
  );

  const result = db.prepare(`
    INSERT INTO set_logs (session_exercise_id, set_number, actual_reps, actual_duration_seconds,
      actual_weight_value, actual_weight_unit, is_pb)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.seId, setNumber, actual_reps ?? null, actual_duration_seconds ?? null,
         actual_weight_value ?? null, actual_weight_unit, isPB ? 1 : 0);

  // Mark exercise in_progress
  db.prepare(`UPDATE session_exercises SET status = 'in_progress' WHERE id = ? AND status = 'pending'`)
    .run(req.params.seId);

  res.status(201).json({
    id: result.lastInsertRowid, set_number: setNumber, is_pb: isPB
  });
});

// PUT /api/workouts/sets/:setId — edit a logged set
router.put('/sets/:setId', (req, res) => {
  const { actual_reps, actual_duration_seconds, actual_weight_value, actual_weight_unit } = req.body;
  db.prepare(`
    UPDATE set_logs SET
      actual_reps = COALESCE(?, actual_reps),
      actual_duration_seconds = COALESCE(?, actual_duration_seconds),
      actual_weight_value = COALESCE(?, actual_weight_value),
      actual_weight_unit = COALESCE(?, actual_weight_unit)
    WHERE id = ?
  `).run(actual_reps ?? null, actual_duration_seconds ?? null,
         actual_weight_value ?? null, actual_weight_unit ?? null, req.params.setId);
  res.json({ ok: true });
});

// PUT /api/workouts/session-exercises/:seId/complete
router.put('/session-exercises/:seId/complete', (req, res) => {
  db.prepare(`UPDATE session_exercises SET status = 'completed' WHERE id = ?`).run(req.params.seId);
  res.json({ ok: true });
});

// PUT /api/workouts/:id/finish — complete a session
router.put('/:id/finish', (req, res) => {
  const { total_rest_seconds } = req.body;

  // Calculate calories burned using MET values
  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(req.params.id);
  const profile = db.prepare('SELECT weight_value, weight_unit FROM weight_log WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1')
    .get(session.user_id);

  let caloriesBurned = null;
  if (profile) {
    const weightKg = toKg(profile.weight_value, profile.weight_unit);
    const exercises = db.prepare(`
      SELECT se.*, e.met_value, e.exercise_type
      FROM session_exercises se JOIN exercises e ON e.id = se.exercise_id
      WHERE se.session_id = ?
    `).all(req.params.id);

    caloriesBurned = exercises.reduce((total, ex) => {
      const sets = db.prepare('SELECT * FROM set_logs WHERE session_exercise_id = ?').all(ex.id);
      const durationHours = sets.reduce((sum, s) => {
        if (ex.exercise_type === 'timed') return sum + (s.actual_duration_seconds || 0) / 3600;
        // Estimate ~3 seconds per rep
        return sum + ((s.actual_reps || 0) * 3) / 3600;
      }, 0);
      return total + (ex.met_value || 4) * weightKg * durationHours;
    }, 0);
  }

  db.prepare(`
    UPDATE workout_sessions SET
      status = 'completed', completed_at = datetime('now'),
      total_rest_seconds = COALESCE(?, total_rest_seconds),
      calories_burned = ?
    WHERE id = ?
  `).run(total_rest_seconds ?? null, caloriesBurned ? Math.round(caloriesBurned) : null, req.params.id);

  // Mark all pending/in_progress exercises as completed
  db.prepare(`UPDATE session_exercises SET status = 'completed' WHERE session_id = ? AND status != 'skipped'`)
    .run(req.params.id);

  res.json(getSession(req.params.id));
});

// PUT /api/workouts/:id/abandon
router.put('/:id/abandon', (req, res) => {
  db.prepare(`UPDATE workout_sessions SET status = 'abandoned', completed_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);
  res.json({ ok: true });
});

// GET /api/workouts/user/:userId/pbs — personal bests for a user
router.get('/user/:userId/pbs', (req, res) => {
  const pbs = db.prepare(`
    SELECT pb.*, e.name as exercise_name, e.exercise_type
    FROM personal_bests pb
    JOIN exercises e ON e.id = pb.exercise_id
    WHERE pb.user_id = ?
    ORDER BY e.name, pb.rep_count ASC
  `).all(req.params.userId);
  res.json(pbs);
});

module.exports = router;
