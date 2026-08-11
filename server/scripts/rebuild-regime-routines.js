// One-off: rewrites routines 3-10 to exactly match the Gemini-sourced
// "Strength & Hypertrophy Split" 2-regime plan (Universal warm-up/cool-down +
// Day 1/2 Strength + Day 4/5 Hypertrophy per regime), then (re)creates the two
// workout_regimes linking them in day order.
// Run with: node server/scripts/rebuild-regime-routines.js
const db = require('../db/index');

const exId = (() => {
  const cache = new Map();
  return (name) => {
    if (cache.has(name)) return cache.get(name);
    const row = db.prepare('SELECT id FROM exercises WHERE name = ?').get(name);
    if (!row) throw new Error(`Exercise not found: ${name}`);
    cache.set(name, row.id);
    return row.id;
  };
})();

// Targeted warm-up/cool-down — split by Lower vs Upper body day, per the
// "Targeted Warm-Up & Cool-Down Protocols" doc.
const LOWER_WARMUP = [
  { name: "World's Greatest Stretch", sets: 1, reps: 5,  rest: 0 },
  { name: '90/90 Hip Transfers',      sets: 1, reps: 10, rest: 0 },
  { name: 'Glute Bridge (Bodyweight)', sets: 1, reps: 15, rest: 30 },
];
const LOWER_COOLDOWN = [
  { name: 'Couch Stretch',            sets: 2, duration: 60, rest: 15 },
  { name: 'Seated Hamstring Stretch', sets: 2, duration: 60, rest: 15 },
];
const UPPER_WARMUP = [
  { name: 'Band/Towel Dislocate',     sets: 1, reps: 15, rest: 0 },
  { name: 'Cat-Cow',                  sets: 1, reps: 10, rest: 0 },
  { name: 'Thoracic Rotation',        sets: 1, reps: 10, rest: 0 },
  { name: 'Scapular Push-Up',         sets: 1, reps: 10, rest: 30 },
];
const UPPER_COOLDOWN = [
  { name: 'Doorway Chest Stretch',    sets: 2, duration: 60, rest: 15 },
  { name: "Child's Pose",             sets: 1, duration: 60, rest: 0 },
];

// routineId -> { title, main: [{name,sets,reps|duration,rest}] }
const ROUTINES = {
  // ─── Regime 1 (32M) — Strength days (2–3 min rest) then Hypertrophy days (90s rest) ───
  3: { // Day 1: Lower Body (Strength Focus)
    title: 'Lower Body (Strength Focus)',
    lower: true,
    main: [
      { name: 'Back Squat',            sets: 4, reps: 4,  rest: 150 },
      { name: 'Romanian Deadlift',     sets: 3, reps: 8,  rest: 150 },
      { name: 'Bulgarian Split Squat', sets: 3, reps: 8,  rest: 150 },
      { name: 'Standing Calf Raise',   sets: 4, reps: 12, rest: 150 },
    ],
  },
  4: { // Day 2: Upper Body (Strength Focus)
    title: 'Upper Body (Strength Focus)',
    lower: false,
    main: [
      { name: 'Bench Press',              sets: 4, reps: 4,  rest: 150 },
      { name: 'Seated Cable Row',          sets: 4, reps: 6,  rest: 150 },
      { name: 'Overhead Press',           sets: 3, reps: 8,  rest: 150 },
      { name: 'Lat Pulldown (Wide Grip)', sets: 3, reps: 10, rest: 150 },
      { name: 'Dumbbell Curl',            sets: 3, reps: 10, rest: 150 },
      { name: 'Cable Tricep Pushdown',    sets: 3, reps: 10, rest: 150 },
    ],
  },
  5: { // Day 4: Lower Body (Hypertrophy Focus)
    title: 'Lower Body (Hypertrophy Focus)',
    lower: true,
    main: [
      { name: 'Kettlebell Goblet Squat', sets: 3, reps: 10, rest: 90 },
      { name: 'Cable Pull-Through',      sets: 3, reps: 10, rest: 90 },
      { name: 'Single-Leg Cable Curl', sets: 3, reps: 12, rest: 90 },
      { name: 'Seated Calf Raise',       sets: 4, reps: 15, rest: 90 },
      { name: 'Kneeling Cable Crunch',   sets: 3, reps: 12, rest: 90 },
    ],
  },
  6: { // Day 5: Upper Body (Hypertrophy & Incline Focus)
    title: 'Upper Body (Hypertrophy & Incline Focus)',
    lower: false,
    main: [
      { name: 'Incline Barbell Bench Press', sets: 3, reps: 8,  rest: 90 },
      { name: 'Inverted Row',                sets: 3, reps: 10, rest: 90 },
      { name: 'Dumbbell Bench Press',        sets: 3, reps: 10, rest: 90 },
      { name: 'Dumbbell Lateral Raise',      sets: 4, reps: 12, rest: 90 },
      { name: 'Face Pull',                   sets: 3, reps: 12, rest: 90 },
    ],
  },
  // ─── Regime 2 (32F) — 60–90s rest across all days ───
  7: { // Day 1: Lower Body (Strength & Glute Focus)
    title: 'Lower Body (Strength & Glute Focus)',
    lower: true,
    main: [
      { name: 'Back Squat',            sets: 4, reps: 6,  rest: 90 },
      { name: 'Barbell Hip Thrust',    sets: 4, reps: 8,  rest: 90 },
      { name: 'Bulgarian Split Squat', sets: 3, reps: 10, rest: 90 },
      { name: 'Kneeling Cable Crunch', sets: 3, reps: 12, rest: 90 },
    ],
  },
  8: { // Day 2: Upper Body (Strength & Back Focus)
    title: 'Upper Body (Strength & Back Focus)',
    lower: false,
    main: [
      { name: 'Dumbbell Bench Press',     sets: 3, reps: 8,  rest: 90 },
      { name: 'Seated Cable Row',         sets: 4, reps: 8,  rest: 90 },
      { name: 'Lat Pulldown (Wide Grip)', sets: 3, reps: 10, rest: 90 },
      { name: 'Dumbbell Lateral Raise',   sets: 3, reps: 10, rest: 90 },
      { name: 'Dumbbell Curl',            sets: 2, reps: 10, rest: 90 },
    ],
  },
  9: { // Day 4: Lower Body (Hypertrophy & Hinge)
    title: 'Lower Body (Hypertrophy & Hinge)',
    lower: true,
    main: [
      { name: 'Romanian Deadlift',       sets: 3, reps: 10, rest: 60 },
      { name: 'Kettlebell Goblet Squat', sets: 3, reps: 10, rest: 60 },
      { name: 'Cable Pull-Through',      sets: 3, reps: 12, rest: 60 },
      { name: 'Single-Leg Cable Curl', sets: 3, reps: 12, rest: 60 },
      { name: 'Kettlebell Swing',        sets: 3, reps: 15, rest: 60 },
    ],
  },
  10: { // Day 5: Upper Body (Hypertrophy & Shoulder Focus)
    title: 'Upper Body (Hypertrophy & Shoulder Focus)',
    lower: false,
    main: [
      { name: 'Overhead Press',          sets: 4, reps: 8,  rest: 60 },
      { name: 'Single-Arm Dumbbell Row', sets: 3, reps: 10, rest: 60 },
      { name: 'Face Pull',               sets: 3, reps: 12, rest: 60 },
      { name: 'Dumbbell Lateral Raise',  sets: 3, reps: 12, rest: 60 },
      { name: 'Cable Tricep Pushdown',   sets: 3, reps: 12, rest: 60 },
    ],
  },
};

const insertRE = db.prepare(`
  INSERT INTO routine_exercises (routine_id, exercise_id, order_index, sets, reps, duration_seconds, rest_seconds)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

// Routines 7-10 are tailored to Aastha (32F) — reassign ownership so they show
// up in her own "Start Workout" routine picker.
db.transaction(() => {
  db.prepare('UPDATE routines SET user_id = 2 WHERE id IN (7,8,9,10)').run();
})();

db.transaction(() => {
  for (const [routineId, spec] of Object.entries(ROUTINES)) {
    db.prepare("UPDATE routines SET name = ?, updated_at = datetime('now') WHERE id = ?").run(spec.title, routineId);
    db.prepare('DELETE FROM routine_exercises WHERE routine_id = ?').run(routineId);
    const warmup = spec.lower ? LOWER_WARMUP : UPPER_WARMUP;
    const cooldown = spec.lower ? LOWER_COOLDOWN : UPPER_COOLDOWN;
    let order = 0;
    for (const w of warmup) {
      insertRE.run(routineId, exId(w.name), order++, w.sets, w.reps ?? null, w.duration ?? null, w.rest);
    }
    for (const m of spec.main) {
      insertRE.run(routineId, exId(m.name), order++, m.sets, m.reps ?? null, m.duration ?? null, m.rest);
    }
    for (const c of cooldown) {
      insertRE.run(routineId, exId(c.name), order++, c.sets, c.reps ?? null, c.duration ?? null, c.rest);
    }
    console.log(`Rebuilt routine ${routineId} (${order} exercises)`);
  }
})();

// ─── Create the 2 regimes ──────────────────────────────────────────────────────

const upsertRegime = (userId, name, notes, routineIds) => {
  const existing = db.prepare('SELECT id FROM workout_regimes WHERE user_id = ? AND name = ?').get(userId, name);
  let regimeId;
  if (existing) {
    regimeId = existing.id;
    db.prepare("UPDATE workout_regimes SET notes = ?, updated_at = datetime('now') WHERE id = ?").run(notes, regimeId);
    db.prepare('DELETE FROM regime_days WHERE regime_id = ?').run(regimeId);
  } else {
    regimeId = db.prepare('INSERT INTO workout_regimes (user_id, name, notes) VALUES (?, ?, ?)').run(userId, name, notes).lastInsertRowid;
  }
  const insertDay = db.prepare('INSERT INTO regime_days (regime_id, day_index, routine_id) VALUES (?, ?, ?)');
  routineIds.forEach((rid, i) => insertDay.run(regimeId, i, rid));
  return regimeId;
};

db.transaction(() => {
  const r1 = upsertRegime(
    1, 'General Recomposition',
    'Strength/Hypertrophy split — Days 1–2 are heavy strength days (4–10 reps, 2–3 min rest); Days 4–5 shift to higher-rep hypertrophy work (8–15 reps, 90 sec rest). Barbell-based; Inverted Rows replace Pull-ups.',
    [4, 3, 6, 5] // Upper, Lower, Upper, Lower
  );
  const r2 = upsertRegime(
    2, 'Tailored Recomposition',
    'Strength/Hypertrophy split with consistently shorter 60–90 sec rest periods. Days 1–2 emphasize heavier glute/back-focused lifts; Days 4–5 shift to higher-rep posterior-chain and shoulder hypertrophy work.',
    [8, 7, 10, 9] // Upper, Lower, Upper, Lower
  );
  console.log(`Regime 1 (General Recomposition) id=${r1} -> Anshuman`);
  console.log(`Regime 2 (Tailored Recomposition) id=${r2} -> Aastha`);
})();
