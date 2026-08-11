const express = require('express');
const db = require('../db/index');
const router = express.Router();

function toKg(value, unit) { return unit === 'lb' ? value * 0.453592 : value; }

function getSession(sessionId) {
  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(sessionId);
  if (!session) return null;
  const exercises = db.prepare(`
    SELECT se.*, e.name as exercise_name, e.exercise_type, e.category, e.primary_muscles,
      e.secondary_muscles, e.met_value, e.description, e.gif_url
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

// Rebuilds is_pb on every set_log for (userId, exerciseId) and the personal_bests row(s)
// from scratch, by replaying full history in chronological order. This is the single
// source of truth for PB state — called after any mutation (new set, edited set, deleted
// session) so edits/deletions can never leave a stale or orphaned PB behind.
// Tracks three independent PB types per exercise: weighted reps (max weight; rep_count is
// just a "best reps at that weight" reference), bodyweight reps (max reps), and timed (max duration).
function recomputePBsForExercise(userId, exerciseId) {
  // Warmup/cooldown moves (stretches, primers, mobility drills) aren't trained for
  // progressive overload — tracking a "PR" on them doesn't make sense. Clear any
  // stale is_pb flags/personal_bests left over from before this category existed
  // and skip recomputation entirely.
  const { category } = db.prepare('SELECT category FROM exercises WHERE id = ?').get(exerciseId);
  if (category === 'warmup' || category === 'cooldown') {
    db.prepare(`
      UPDATE set_logs SET is_pb = 0 WHERE id IN (
        SELECT sl.id FROM set_logs sl JOIN session_exercises se ON se.id = sl.session_exercise_id
        JOIN workout_sessions ws ON ws.id = se.session_id
        WHERE ws.user_id = ? AND se.exercise_id = ?
      )
    `).run(userId, exerciseId);
    db.prepare('DELETE FROM personal_bests WHERE user_id = ? AND exercise_id = ?').run(userId, exerciseId);
    return;
  }

  const allSets = db.prepare(`
    SELECT sl.id, sl.actual_reps, sl.actual_duration_seconds, sl.actual_weight_value, sl.actual_weight_unit, sl.logged_at, se.session_id
    FROM set_logs sl
    JOIN session_exercises se ON se.id = sl.session_exercise_id
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE ws.user_id = ? AND se.exercise_id = ?
    ORDER BY sl.logged_at ASC, sl.id ASC
  `).all(userId, exerciseId);

  const updateIsPb = db.prepare('UPDATE set_logs SET is_pb = ? WHERE id = ?');

  let bestWeightKg = -1, bestWeightRow = null;
  let bestBodyweightReps = -1, bestBodyweightRow = null;
  let bestDuration = -1, bestDurationRow = null;

  for (const s of allSets) {
    if (s.actual_reps != null && s.actual_weight_value && s.actual_weight_value > 0) {
      const kg = toKg(s.actual_weight_value, s.actual_weight_unit);
      let isPb = 0;
      if (kg > bestWeightKg) { isPb = 1; bestWeightKg = kg; bestWeightRow = s; }
      else if (kg === bestWeightKg) {
        isPb = 2;
        if (s.actual_reps > (bestWeightRow?.actual_reps ?? 0)) bestWeightRow = s;
      }
      updateIsPb.run(isPb, s.id);
    } else if (s.actual_reps != null) {
      let isPb = 0;
      if (s.actual_reps > bestBodyweightReps) { isPb = 1; bestBodyweightReps = s.actual_reps; bestBodyweightRow = s; }
      else if (s.actual_reps === bestBodyweightReps) { isPb = 2; }
      updateIsPb.run(isPb, s.id);
    } else if (s.actual_duration_seconds != null) {
      let isPb = 0;
      if (s.actual_duration_seconds > bestDuration) { isPb = 1; bestDuration = s.actual_duration_seconds; bestDurationRow = s; }
      else if (s.actual_duration_seconds === bestDuration) { isPb = 2; }
      updateIsPb.run(isPb, s.id);
    }
  }

  // If this exercise has any weighted history, a 0-weight set is not a meaningful
  // "bodyweight PR" — it's a data entry error (forgot to fill in weight). Clear those
  // is_pb flags and don't persist a bodyweight row alongside the weighted one.
  if (bestWeightKg > -1 && bestBodyweightRow) {
    for (const s of allSets) {
      if (s.actual_reps != null && (!s.actual_weight_value || s.actual_weight_value === 0)) {
        updateIsPb.run(0, s.id);
      }
    }
    bestBodyweightRow = null;
  }

  const syncRow = (matchClause, winnerRow, fields) => {
    const existing = db.prepare(`SELECT id FROM personal_bests WHERE user_id = ? AND exercise_id = ? AND ${matchClause}`)
      .get(userId, exerciseId);
    if (!winnerRow) {
      if (existing) db.prepare('DELETE FROM personal_bests WHERE id = ?').run(existing.id);
      return;
    }
    if (existing) {
      const setClauses = Object.keys(fields).map(k => `${k} = ?`).join(', ');
      db.prepare(`UPDATE personal_bests SET ${setClauses}, achieved_at = ?, session_id = ? WHERE id = ?`)
        .run(...Object.values(fields), winnerRow.logged_at, winnerRow.session_id, existing.id);
    } else {
      const cols = Object.keys(fields);
      db.prepare(`
        INSERT INTO personal_bests (user_id, exercise_id, ${cols.join(', ')}, achieved_at, session_id)
        VALUES (?, ?, ${cols.map(() => '?').join(', ')}, ?, ?)
      `).run(userId, exerciseId, ...Object.values(fields), winnerRow.logged_at, winnerRow.session_id);
    }
  };

  // Delete bodyweight row first so it doesn't conflict when the weighted row
  // later tries to UPDATE its rep_count to a value that bodyweight already has
  // (both share the unique index on (user_id, exercise_id, rep_count)).
  syncRow("(weight_value IS NULL OR weight_value = 0) AND rep_count IS NOT NULL", bestBodyweightRow, bestBodyweightRow
    ? { rep_count: bestBodyweightRow.actual_reps, weight_value: 0 }
    : {});
  syncRow('weight_value IS NOT NULL AND weight_value > 0', bestWeightRow, bestWeightRow
    ? { weight_value: bestWeightRow.actual_weight_value, weight_unit: bestWeightRow.actual_weight_unit, rep_count: bestWeightRow.actual_reps }
    : {});
  syncRow('rep_count IS NULL', bestDurationRow, bestDurationRow
    ? { duration_seconds: bestDurationRow.actual_duration_seconds }
    : {});
}

// GET /api/workouts/user/:userId — list sessions
router.get('/user/:userId', (req, res) => {
  const { status, limit = 20, date } = req.query;
  const filters = ['ws.user_id = ?'];
  const params = [req.params.userId];
  if (status) { filters.push('ws.status = ?'); params.push(status); }
  if (date) { filters.push("date(ws.started_at, 'localtime') = ?"); params.push(date); }
  params.push(Number(limit));
  const sessions = db.prepare(`
    SELECT ws.*, r.name as routine_name,
      (SELECT COUNT(*) FROM session_exercises se WHERE se.session_id = ws.id AND se.status NOT IN ('skipped', 'pending')) as exercise_count
    FROM workout_sessions ws
    LEFT JOIN routines r ON r.id = ws.routine_id
    WHERE ${filters.join(' AND ')}
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
  const {
    actual_reps, actual_duration_seconds, actual_weight_value, actual_weight_unit = 'lb',
    actual_rest_seconds, notes, is_assisted,
  } = req.body;

  const se = db.prepare(`
    SELECT se.*, ws.user_id FROM session_exercises se
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE se.id = ?
  `).get(req.params.seId);
  if (!se) return res.status(404).json({ error: 'Session exercise not found' });

  const setNumber = (db.prepare('SELECT COUNT(*) as c FROM set_logs WHERE session_exercise_id = ?')
    .get(req.params.seId).c) + 1;

  const result = db.prepare(`
    INSERT INTO set_logs (session_exercise_id, set_number, actual_reps, actual_duration_seconds,
      actual_weight_value, actual_weight_unit, actual_rest_seconds, notes, is_assisted)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(req.params.seId, setNumber, actual_reps ?? null, actual_duration_seconds ?? null,
         actual_weight_value ?? null, actual_weight_unit,
         actual_rest_seconds ?? null, notes ?? null, is_assisted ? 1 : 0);

  recomputePBsForExercise(se.user_id, se.exercise_id);
  const isPB = db.prepare('SELECT is_pb FROM set_logs WHERE id = ?').get(result.lastInsertRowid).is_pb;

  // Mark exercise in_progress
  db.prepare(`UPDATE session_exercises SET status = 'in_progress' WHERE id = ? AND status = 'pending'`)
    .run(req.params.seId);

  res.status(201).json({
    id: result.lastInsertRowid, set_number: setNumber, is_pb: isPB
  });
});

// PATCH /api/workouts/session-exercises/:seId — update target_sets (add extra set)
// Also resets status to in_progress so the set form re-appears.
router.patch('/session-exercises/:seId', (req, res) => {
  const { target_sets } = req.body;
  if (target_sets == null) return res.status(400).json({ error: 'target_sets required' });
  db.prepare("UPDATE session_exercises SET target_sets = ?, status = 'in_progress' WHERE id = ?")
    .run(target_sets, req.params.seId);
  res.json({ ok: true });
});

// PUT /api/workouts/sets/:setId — edit a logged set
router.put('/sets/:setId', (req, res) => {
  const { actual_reps, actual_duration_seconds, actual_weight_value, actual_weight_unit, is_assisted } = req.body;

  const setRow = db.prepare(`
    SELECT sl.*, se.exercise_id, se.session_id, ws.user_id
    FROM set_logs sl
    JOIN session_exercises se ON se.id = sl.session_exercise_id
    JOIN workout_sessions ws ON ws.id = se.session_id
    WHERE sl.id = ?
  `).get(req.params.setId);
  if (!setRow) return res.status(404).json({ error: 'Set not found' });

  db.prepare(`
    UPDATE set_logs SET
      actual_reps = COALESCE(?, actual_reps),
      actual_duration_seconds = COALESCE(?, actual_duration_seconds),
      actual_weight_value = COALESCE(?, actual_weight_value),
      actual_weight_unit = COALESCE(?, actual_weight_unit),
      is_assisted = COALESCE(?, is_assisted)
    WHERE id = ?
  `).run(actual_reps ?? null, actual_duration_seconds ?? null,
         actual_weight_value ?? null, actual_weight_unit ?? null,
         is_assisted != null ? (is_assisted ? 1 : 0) : null, req.params.setId);

  // Full recompute (not incremental) so editing a set DOWN — or any other edit — can never
  // leave a stale/orphaned PB behind; it always reflects the true current history.
  recomputePBsForExercise(setRow.user_id, setRow.exercise_id);
  const isPB = db.prepare('SELECT is_pb FROM set_logs WHERE id = ?').get(req.params.setId).is_pb;

  res.json({ ok: true, is_pb: isPB });
});

// PUT /api/workouts/session-exercises/:seId/complete
router.put('/session-exercises/:seId/complete', (req, res) => {
  db.prepare(`UPDATE session_exercises SET status = 'completed' WHERE id = ?`).run(req.params.seId);
  res.json({ ok: true });
});

// PUT /api/workouts/session-exercises/:seId/swap — replace exercise in place (no sets logged)
router.put('/session-exercises/:seId/swap', (req, res) => {
  const { exercise_id } = req.body;
  if (!exercise_id) return res.status(400).json({ error: 'exercise_id required' });
  const se = db.prepare('SELECT * FROM session_exercises WHERE id = ?').get(req.params.seId);
  if (!se) return res.status(404).json({ error: 'Session exercise not found' });
  db.prepare(`UPDATE session_exercises SET exercise_id = ?, status = 'pending' WHERE id = ?`)
    .run(exercise_id, req.params.seId);
  res.json(getSession(se.session_id));
});

// PUT /api/workouts/session-exercises/:seId/order — swap order with an adjacent exercise
router.put('/session-exercises/:seId/order', (req, res) => {
  const { swap_with_id } = req.body;
  if (!swap_with_id) return res.status(400).json({ error: 'swap_with_id required' });
  const a = db.prepare('SELECT * FROM session_exercises WHERE id = ?').get(req.params.seId);
  const b = db.prepare('SELECT * FROM session_exercises WHERE id = ?').get(swap_with_id);
  if (!a || !b) return res.status(404).json({ error: 'Session exercise not found' });
  db.transaction(() => {
    db.prepare('UPDATE session_exercises SET order_index = ? WHERE id = ?').run(b.order_index, a.id);
    db.prepare('UPDATE session_exercises SET order_index = ? WHERE id = ?').run(a.order_index, b.id);
  })();
  res.json(getSession(a.session_id));
});

// PUT /api/workouts/:id/finish — complete a session
router.put('/:id/finish', (req, res) => {
  const { total_rest_seconds } = req.body;

  const session = db.prepare('SELECT * FROM workout_sessions WHERE id = ?').get(req.params.id);
  const profile = db.prepare('SELECT weight_value, weight_unit FROM weight_log WHERE user_id = ? ORDER BY logged_at DESC LIMIT 1')
    .get(session.user_id);

  let caloriesBurned = null;
  if (profile) {
    const weightKg = toKg(profile.weight_value, profile.weight_unit);
    const startMs = new Date(session.started_at.replace(' ', 'T') + 'Z').getTime();
    const totalHours = Math.max(0, (Date.now() - startMs) / 3_600_000);

    const exercises = db.prepare(`
      SELECT se.*, e.met_value, e.exercise_type
      FROM session_exercises se JOIN exercises e ON e.id = se.exercise_id
      WHERE se.session_id = ?
    `).all(req.params.id);

    // Per-exercise calorie estimation using actual logged sets
    let exerciseCals = 0;
    for (const ex of exercises) {
      const sets = db.prepare('SELECT * FROM set_logs WHERE session_exercise_id = ?').all(ex.id);
      if (!sets.length) continue;
      const met = ex.met_value || 4;

      if (ex.exercise_type === 'timed') {
        // Timed exercises: MET × duration × bodyweight
        const totalSecs = sets.reduce((s, set) => s + (set.actual_duration_seconds || 0), 0);
        exerciseCals += met * weightKg * (totalSecs / 3600);
      } else {
        // Strength: ~4 seconds time-under-tension per rep × MET, plus volume-based component
        const totalReps = sets.reduce((s, set) => s + (set.actual_reps || 0), 0);
        const avgWeightKg = sets.reduce((s, set) => s + toKg(set.actual_weight_value || 0, set.actual_weight_unit || 'lb'), 0) / sets.length;
        const tensionSecs = totalReps * 4;
        const tensionCals = met * weightKg * (tensionSecs / 3600);
        // Epley-based volume component: ~0.065 kcal per kg of load per rep
        const volumeCals = avgWeightKg * totalReps * 0.065;
        exerciseCals += Math.max(tensionCals, volumeCals);
      }
    }

    // Overhead: transitions, setup, coaching between sets = MET 2.5 × 30% of session time
    const overheadCals = 2.5 * weightKg * totalHours * 0.3;
    caloriesBurned = exerciseCals + overheadCals;

    // Sanity clamp: never exceed MET 12 × weight × total hours
    if (exercises.length === 0) caloriesBurned = 4 * weightKg * totalHours;
    caloriesBurned = Math.min(caloriesBurned, 12 * weightKg * totalHours);
  }

  db.prepare(`
    UPDATE workout_sessions SET
      status = 'completed', completed_at = datetime('now'),
      total_rest_seconds = COALESCE(?, total_rest_seconds),
      calories_burned = ?
    WHERE id = ?
  `).run(total_rest_seconds ?? null, caloriesBurned ? Math.round(caloriesBurned) : null, req.params.id);

  db.prepare(`UPDATE session_exercises SET status = 'completed' WHERE session_id = ? AND status != 'skipped'`)
    .run(req.params.id);

  res.json(getSession(req.params.id));
});

// PATCH /api/workouts/:id — update calories_burned override
router.patch('/:id', (req, res) => {
  const { calories_burned } = req.body;
  if (calories_burned === undefined) return res.status(400).json({ error: 'calories_burned required' });
  db.prepare('UPDATE workout_sessions SET calories_burned = ? WHERE id = ?')
    .run(calories_burned !== null ? Math.round(Number(calories_burned)) : null, req.params.id);
  res.json({ ok: true });
});

// POST /api/workouts/log-manual — log a completed activity without live tracking
router.post('/log-manual', (req, res) => {
  const { user_id, name = 'Activity', duration_minutes, calories_burned, date } = req.body;
  if (!user_id) return res.status(400).json({ error: 'user_id is required' });

  // Use provided date (YYYY-MM-DD) or today in UTC; store as UTC datetime
  const completedAt = date
    ? `${date}T23:59:00Z`.replace('T', ' ').replace('Z', '') // store as "YYYY-MM-DD 23:59:00"
    : null; // null → use datetime('now')

  const result = db.prepare(`
    INSERT INTO workout_sessions (user_id, name, status, completed_at, calories_burned)
    VALUES (?, ?, 'completed', COALESCE(?, datetime('now')), ?)
  `).run(user_id, name, completedAt, calories_burned ? Math.round(calories_burned) : null);

  const sessionId = result.lastInsertRowid;

  if (duration_minutes && duration_minutes > 0) {
    db.prepare(`
      UPDATE workout_sessions SET started_at = datetime(completed_at, ? || ' minutes') WHERE id = ?
    `).run(`-${Math.round(duration_minutes)}`, sessionId);
  }

  res.status(201).json(getSession(sessionId));
});

// DELETE /api/workouts/:id — remove a session from history
router.delete('/:id', (req, res) => {
  const session = db.prepare('SELECT user_id FROM workout_sessions WHERE id = ?').get(req.params.id);
  if (!session) return res.json({ ok: true });
  const exerciseIds = db.prepare('SELECT DISTINCT exercise_id FROM session_exercises WHERE session_id = ?')
    .all(req.params.id).map(r => r.exercise_id);

  db.transaction(() => {
    // personal_bests.session_id has no ON DELETE behavior, so any PB row pointing at this
    // session must be cleared first or the delete violates the FK constraint. Recomputing
    // below rebuilds those rows correctly from whatever history remains after the delete —
    // so a deleted session can never leave a stale/orphaned PB behind.
    db.prepare('DELETE FROM personal_bests WHERE session_id = ?').run(req.params.id);
    db.prepare('DELETE FROM workout_sessions WHERE id = ?').run(req.params.id);
    for (const exerciseId of exerciseIds) {
      recomputePBsForExercise(session.user_id, exerciseId);
    }
  })();

  res.json({ ok: true });
});

// PUT /api/workouts/:id/abandon
router.put('/:id/abandon', (req, res) => {
  db.prepare(`UPDATE workout_sessions SET status = 'abandoned', completed_at = datetime('now') WHERE id = ?`)
    .run(req.params.id);
  res.json({ ok: true });
});

// GET /api/workouts/progress/:userId — 12-week progress data for visualizations
router.get('/progress/:userId', (req, res) => {
  const userId = parseInt(req.params.userId);
  const WEEKS = 12;

  // Build Monday-aligned week start dates oldest → newest
  const now = new Date();
  const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Mon
  const thisMonday = new Date(now);
  thisMonday.setDate(now.getDate() - dayOfWeek);
  thisMonday.setHours(0, 0, 0, 0);

  const weekStarts = [];
  for (let i = WEEKS - 1; i >= 0; i--) {
    const d = new Date(thisMonday);
    d.setDate(d.getDate() - i * 7);
    weekStarts.push(d.toISOString().slice(0, 10));
  }
  const rangeStart = weekStarts[0];

  function getWeekIdx(dateStr) {
    for (let i = weekStarts.length - 1; i >= 0; i--) {
      if (dateStr >= weekStarts[i]) return i;
    }
    return -1;
  }

  const rows = db.prepare(`
    SELECT
      sl.actual_weight_value, sl.actual_weight_unit,
      sl.actual_reps, sl.is_pb,
      substr(sl.logged_at, 1, 10) as log_date,
      se.exercise_id,
      e.name as exercise_name,
      e.primary_muscles,
      e.category
    FROM set_logs sl
    JOIN session_exercises se ON sl.session_exercise_id = se.id
    JOIN workout_sessions ws ON se.session_id = ws.id
    JOIN exercises e ON se.exercise_id = e.id
    WHERE ws.user_id = ?
      AND ws.status = 'completed'
      AND sl.logged_at >= ?
      AND e.category IN ('strength', 'hypertrophy')
    ORDER BY sl.logged_at ASC
  `).all(userId, rangeStart);

  const MUSCLE_KEYS = ['chest','shoulders','biceps','triceps','upper_back','lats',
                       'lower_back','core','quads','hamstrings','glutes','calves'];
  const muscleWeeklyVolume = {};
  MUSCLE_KEYS.forEach(k => { muscleWeeklyVolume[k] = new Array(WEEKS).fill(0); });

  const exerciseHistoryMap = {};

  const MOVEMENT_MUSCLES = {
    push:  ['chest','shoulders','triceps'],
    pull:  ['lats','upper_back','biceps','rear_delts','forearms'],
    hinge: ['glutes','hamstrings','lower_back'],
    squat: ['quads','hip_flexor'],
    core:  ['core'],
  };
  const movementPattern = { push: 0, pull: 0, hinge: 0, squat: 0, core: 0 };
  const fourWeeksStart = weekStarts[Math.max(0, WEEKS - 4)];

  for (const row of rows) {
    const wi = getWeekIdx(row.log_date);
    if (wi < 0) continue;
    const muscles = JSON.parse(row.primary_muscles || '[]');

    muscles.forEach(m => {
      if (muscleWeeklyVolume[m] !== undefined) muscleWeeklyVolume[m][wi]++;
    });

    if (row.log_date >= fourWeeksStart) {
      for (const [pattern, patMuscles] of Object.entries(MOVEMENT_MUSCLES)) {
        if (muscles.some(m => patMuscles.includes(m))) {
          movementPattern[pattern]++;
          break;
        }
      }
    }

    if (row.actual_weight_value > 0 && row.actual_reps > 0) {
      const e1rm = Math.round(row.actual_weight_value * (1 + row.actual_reps / 30) * 10) / 10;
      const exId = row.exercise_id;
      if (!exerciseHistoryMap[exId]) {
        exerciseHistoryMap[exId] = {
          exercise_id: exId,
          exercise_name: row.exercise_name,
          primary_muscles: muscles,
          sessions: {},
        };
      }
      const sess = exerciseHistoryMap[exId].sessions;
      if (!sess[row.log_date] || e1rm > sess[row.log_date].e1rm) {
        sess[row.log_date] = {
          date: row.log_date,
          e1rm,
          weight: row.actual_weight_value,
          weight_unit: row.actual_weight_unit || 'lb',
          reps: row.actual_reps,
          is_pb: row.is_pb === 1,
        };
      } else if (row.is_pb === 1) {
        sess[row.log_date].is_pb = true;
      }
    }
  }

  const exerciseStrength = Object.values(exerciseHistoryMap)
    .map(ex => {
      const { sessions, ...rest } = ex;
      return { ...rest, history: Object.values(sessions).sort((a, b) => a.date.localeCompare(b.date)) };
    })
    .filter(ex => ex.history.length >= 2)
    .sort((a, b) => {
      const aLast = a.history.at(-1).date;
      const bLast = b.history.at(-1).date;
      if (bLast !== aLast) return bLast.localeCompare(aLast);
      return b.history.length - a.history.length;
    })
    .slice(0, 8);

  res.json({ muscleWeeklyVolume, exerciseStrength, movementPattern, weekStarts });
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
