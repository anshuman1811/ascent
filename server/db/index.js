const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/fitness.db');

// Ensure data directory exists
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ─── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    avatar_color TEXT NOT NULL DEFAULT '#6366f1',
    created_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    id               INTEGER PRIMARY KEY,
    user_id          INTEGER NOT NULL UNIQUE REFERENCES users(id),
    birth_date       TEXT,
    sex              TEXT CHECK(sex IN ('male','female','other')),
    height_value     REAL,
    height_unit      TEXT NOT NULL DEFAULT 'ft' CHECK(height_unit IN ('ft','cm')),
    activity_level   TEXT NOT NULL DEFAULT 'moderate'
                       CHECK(activity_level IN ('sedentary','light','moderate','active','very_active')),
    calorie_target   REAL,
    tdee_estimate    REAL,
    protein_target_g REAL,
    carbs_target_g   REAL,
    fat_target_g     REAL,
    fiber_target_g   REAL,
    weight_goal_type TEXT NOT NULL DEFAULT 'maintain'
                       CHECK(weight_goal_type IN ('lose','maintain','gain')),
    target_weight_value REAL,
    target_weight_unit  TEXT NOT NULL DEFAULT 'lb',
    weight_unit      TEXT NOT NULL DEFAULT 'lb' CHECK(weight_unit IN ('lb','kg')),
    volume_unit      TEXT NOT NULL DEFAULT 'oz' CHECK(volume_unit IN ('oz','ml')),
    length_unit      TEXT NOT NULL DEFAULT 'ft' CHECK(length_unit IN ('ft','cm')),
    updated_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS weight_log (
    id           INTEGER PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    weight_value REAL NOT NULL,
    weight_unit  TEXT NOT NULL DEFAULT 'lb',
    logged_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS foods (
    id           INTEGER PRIMARY KEY,
    name         TEXT NOT NULL,
    brand        TEXT,
    serving_size REAL NOT NULL DEFAULT 1,
    serving_unit TEXT NOT NULL DEFAULT 'serving',
    calories     REAL NOT NULL DEFAULT 0,
    protein_g    REAL NOT NULL DEFAULT 0,
    carbs_g      REAL NOT NULL DEFAULT 0,
    fat_g        REAL NOT NULL DEFAULT 0,
    fiber_g      REAL NOT NULL DEFAULT 0,
    sugar_g      REAL NOT NULL DEFAULT 0,
    created_by   INTEGER REFERENCES users(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id   INTEGER NOT NULL,
    filename    TEXT NOT NULL,
    caption     TEXT,
    order_index INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_images_entity ON images(entity_type, entity_id);

  CREATE TABLE IF NOT EXISTS meals (
    id        INTEGER PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id),
    meal_type TEXT NOT NULL DEFAULT 'snack'
                CHECK(meal_type IN ('breakfast','lunch','dinner','snack','pre_workout','post_workout')),
    notes     TEXT,
    logged_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS meal_items (
    id        INTEGER PRIMARY KEY,
    meal_id   INTEGER NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
    food_id   INTEGER NOT NULL REFERENCES foods(id),
    quantity  REAL NOT NULL DEFAULT 1,
    calories  REAL NOT NULL DEFAULT 0,
    protein_g REAL NOT NULL DEFAULT 0,
    carbs_g   REAL NOT NULL DEFAULT 0,
    fat_g     REAL NOT NULL DEFAULT 0,
    fiber_g   REAL NOT NULL DEFAULT 0,
    sugar_g   REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS exercises (
    id               INTEGER PRIMARY KEY,
    name             TEXT NOT NULL,
    exercise_type    TEXT NOT NULL DEFAULT 'reps' CHECK(exercise_type IN ('reps','timed')),
    primary_muscles  TEXT NOT NULL DEFAULT '[]',
    secondary_muscles TEXT NOT NULL DEFAULT '[]',
    met_value        REAL DEFAULT 4.0,
    notes            TEXT,
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS routines (
    id         INTEGER PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    name       TEXT NOT NULL,
    notes      TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS routine_exercises (
    id                  INTEGER PRIMARY KEY,
    routine_id          INTEGER NOT NULL REFERENCES routines(id) ON DELETE CASCADE,
    exercise_id         INTEGER NOT NULL REFERENCES exercises(id),
    order_index         INTEGER NOT NULL DEFAULT 0,
    sets                INTEGER NOT NULL DEFAULT 3,
    reps                INTEGER,
    duration_seconds    INTEGER,
    weight_value        REAL,
    weight_unit         TEXT NOT NULL DEFAULT 'lb',
    rest_seconds        INTEGER NOT NULL DEFAULT 90
  );

  CREATE TABLE IF NOT EXISTS workout_sessions (
    id                 INTEGER PRIMARY KEY,
    user_id            INTEGER NOT NULL REFERENCES users(id),
    routine_id         INTEGER REFERENCES routines(id),
    name               TEXT NOT NULL,
    started_at         TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at       TEXT,
    status             TEXT NOT NULL DEFAULT 'in_progress'
                         CHECK(status IN ('in_progress','completed','abandoned')),
    total_rest_seconds INTEGER NOT NULL DEFAULT 0,
    calories_burned    REAL
  );

  CREATE TABLE IF NOT EXISTS session_exercises (
    id                      INTEGER PRIMARY KEY,
    session_id              INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id             INTEGER NOT NULL REFERENCES exercises(id),
    order_index             INTEGER NOT NULL DEFAULT 0,
    target_sets             INTEGER NOT NULL DEFAULT 3,
    target_reps             INTEGER,
    target_duration_seconds INTEGER,
    target_weight_value     REAL,
    target_weight_unit      TEXT NOT NULL DEFAULT 'lb',
    rest_seconds            INTEGER NOT NULL DEFAULT 90,
    status                  TEXT NOT NULL DEFAULT 'pending'
                              CHECK(status IN ('pending','in_progress','completed','skipped'))
  );

  CREATE TABLE IF NOT EXISTS set_logs (
    id                      INTEGER PRIMARY KEY,
    session_exercise_id     INTEGER NOT NULL REFERENCES session_exercises(id) ON DELETE CASCADE,
    set_number              INTEGER NOT NULL,
    actual_reps             INTEGER,
    actual_duration_seconds REAL,
    actual_weight_value     REAL,
    actual_weight_unit      TEXT NOT NULL DEFAULT 'lb',
    is_pb                   INTEGER NOT NULL DEFAULT 0,
    logged_at               TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS personal_bests (
    id               INTEGER PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id),
    exercise_id      INTEGER NOT NULL REFERENCES exercises(id),
    rep_count        INTEGER,
    duration_seconds REAL,
    weight_value     REAL,
    weight_unit      TEXT NOT NULL DEFAULT 'lb',
    achieved_at      TEXT NOT NULL DEFAULT (datetime('now')),
    session_id       INTEGER REFERENCES workout_sessions(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_pb_user_exercise_reps
    ON personal_bests(user_id, exercise_id, rep_count)
    WHERE rep_count IS NOT NULL;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_pb_user_exercise_timed
    ON personal_bests(user_id, exercise_id)
    WHERE rep_count IS NULL AND duration_seconds IS NOT NULL;
`);

// ─── Migrations ───────────────────────────────────────────────────────────────
// Safe to run repeatedly; SQLite throws "duplicate column" which we swallow.

const MIGRATIONS = [
  `ALTER TABLE foods ADD COLUMN saturated_fat_g REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE foods ADD COLUMN cholesterol_mg  REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE foods ADD COLUMN sodium_mg       REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE foods ADD COLUMN potassium_mg    REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE meal_items ADD COLUMN saturated_fat_g REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE meal_items ADD COLUMN cholesterol_mg  REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE meal_items ADD COLUMN sodium_mg       REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE meal_items ADD COLUMN potassium_mg    REAL NOT NULL DEFAULT 0`,
  `ALTER TABLE exercises ADD COLUMN category TEXT NOT NULL DEFAULT 'strength'`,
  `ALTER TABLE user_profiles ADD COLUMN sodium_target_mg REAL`,
];
for (const sql of MIGRATIONS) {
  try { db.exec(sql); } catch (_) {}
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

const seedUsers = db.prepare('INSERT OR IGNORE INTO users (id, name, avatar_color) VALUES (?, ?, ?)');
const seedProfile = db.prepare(`
  INSERT OR IGNORE INTO user_profiles (user_id, weight_unit, volume_unit, length_unit)
  VALUES (?, 'lb', 'oz', 'ft')
`);

db.transaction(() => {
  seedUsers.run(1, 'User 1', '#6366f1');
  seedUsers.run(2, 'User 2', '#f59e0b');
  seedProfile.run(1);
  seedProfile.run(2);
})();

// ─── Exercise library ─────────────────────────────────────────────────────────
// Uses INSERT OR IGNORE so user-added exercises are never touched.
// Always updates category on existing rows (safe — category was just added).

const checkEx  = db.prepare('SELECT id FROM exercises WHERE name = ?');
const insertEx = db.prepare(`
  INSERT INTO exercises (name, exercise_type, category, primary_muscles, secondary_muscles, met_value)
  VALUES (?, ?, ?, ?, ?, ?)
`);
const setCat = db.prepare(`UPDATE exercises SET category = ? WHERE name = ?`);

function ex(name, type, cat, pri, sec, met) {
  if (!checkEx.get(name)) {
    insertEx.run(name, type, cat, JSON.stringify(pri), JSON.stringify(sec), met);
  }
  setCat.run(cat, name);
}

db.transaction(() => {
  // ── Warmup ──────────────────────────────────────────────────────────────────
  ex('Jumping Jacks',              'timed', 'warmup', ['quads','calves'],              ['core','shoulders'],          2.5);
  ex('Arm Circles',                'timed', 'warmup', ['shoulders'],                   ['rotator_cuff'],              2.5);
  ex('Leg Swings',                 'reps',  'warmup', ['hip_flexor','glutes'],          ['hamstrings'],                2.5);
  ex('Hip Circles',                'timed', 'warmup', ['hip_flexor','glutes'],          ['core'],                      2.5);
  ex('Inchworm',                   'reps',  'warmup', ['hamstrings','core'],            ['shoulders','lower_back'],    3.0);
  ex("World's Greatest Stretch",   'reps',  'warmup', ['hip_flexor','upper_back'],      ['hamstrings','shoulders'],    3.0);
  ex('Cat-Cow',                    'reps',  'warmup', ['lower_back','core'],            [],                            2.0);
  ex('Thoracic Rotation',          'reps',  'warmup', ['upper_back'],                   ['shoulders','core'],          2.5);
  ex('Glute Bridge (Bodyweight)',  'reps',  'warmup', ['glutes'],                       ['hamstrings','core'],         3.0);
  ex('Band Pull-Apart',            'reps',  'warmup', ['rear_delts','upper_back'],      ['rotator_cuff'],              2.5);
  ex('Hip Flexor Lunge (Dynamic)', 'reps',  'warmup', ['hip_flexor','quads'],           ['glutes'],                    3.0);
  ex('Bodyweight Squat',           'reps',  'warmup', ['quads','glutes'],               ['hamstrings','core'],         3.5);
  ex('Scapular Pull-Up',           'reps',  'warmup', ['upper_back','lats'],            ['shoulders'],                 3.0);

  // ── Strength — Barbell / Squat Rack ─────────────────────────────────────────
  ex('Back Squat',                 'reps',  'strength', ['quads','glutes'],             ['hamstrings','core','lower_back'], 5.5);
  ex('Front Squat',                'reps',  'strength', ['quads','core'],               ['glutes','upper_back'],            5.5);
  ex('Pause Squat',                'reps',  'strength', ['quads','glutes'],             ['hamstrings','core'],              5.5);
  ex('Overhead Press',             'reps',  'strength', ['shoulders','triceps'],        ['core','upper_back'],              4.5);
  ex('Bench Press',                'reps',  'strength', ['chest','triceps'],            ['shoulders'],                      5.0);
  ex('Close-Grip Bench Press',     'reps',  'strength', ['triceps','chest'],            ['shoulders'],                      4.5);
  ex('Deadlift',                   'reps',  'strength', ['hamstrings','glutes','lower_back'], ['core','upper_back'],        6.0);
  ex('Romanian Deadlift',          'reps',  'strength', ['hamstrings','glutes'],        ['lower_back'],                     5.0);
  ex('Rack Pull',                  'reps',  'strength', ['upper_back','hamstrings'],    ['glutes','core'],                  5.5);
  ex('Good Morning',               'reps',  'strength', ['hamstrings','lower_back'],    ['glutes'],                         4.0);
  ex('Bent-Over Barbell Row',      'reps',  'strength', ['upper_back','lats'],          ['biceps','rear_delts'],            5.0);
  ex('Barbell Hip Thrust',         'reps',  'strength', ['glutes'],                     ['hamstrings','core'],              4.5);
  ex('Barbell Curl',               'reps',  'strength', ['biceps'],                     ['forearms'],                       3.5);
  ex('Barbell Lunge',              'reps',  'strength', ['quads','glutes'],             ['hamstrings','calves'],            5.0);
  ex('Zercher Squat',              'reps',  'strength', ['quads','biceps','core'],      ['glutes','upper_back'],            5.5);
  ex('Power Clean',                'reps',  'strength', ['glutes','hamstrings','shoulders'], ['core','upper_back','quads'], 6.0);

  // ── Strength — Dumbbell ──────────────────────────────────────────────────────
  ex('Dumbbell Bench Press',       'reps',  'strength', ['chest','triceps'],            ['shoulders'],                      5.0);
  ex('Incline Dumbbell Press',     'reps',  'strength', ['chest','triceps'],            ['shoulders'],                      5.0);
  ex('Dumbbell Fly',               'reps',  'strength', ['chest'],                      ['shoulders'],                      4.0);
  ex('Single-Arm Dumbbell Row',    'reps',  'strength', ['lats','upper_back'],          ['biceps','rear_delts'],            4.5);
  ex('Dumbbell Lateral Raise',     'reps',  'strength', ['shoulders'],                  ['rear_delts'],                     3.5);
  ex('Dumbbell Front Raise',       'reps',  'strength', ['shoulders'],                  [],                                 3.5);
  ex('Dumbbell Rear Delt Fly',     'reps',  'strength', ['rear_delts'],                 ['upper_back'],                     3.5);
  ex('Dumbbell Curl',              'reps',  'strength', ['biceps'],                     ['forearms'],                       3.5);
  ex('Hammer Curl',                'reps',  'strength', ['biceps','forearms'],          [],                                 3.5);
  ex('Dumbbell Shoulder Press',    'reps',  'strength', ['shoulders'],                  ['triceps'],                        4.5);
  ex('Dumbbell Romanian Deadlift', 'reps',  'strength', ['hamstrings','glutes'],        ['lower_back'],                     5.0);
  ex('Dumbbell Lunge',             'reps',  'strength', ['quads','glutes'],             ['hamstrings','calves'],            5.0);
  ex('Goblet Squat',               'reps',  'strength', ['quads','glutes'],             ['core'],                           5.0);
  ex('Dumbbell Tricep Kickback',   'reps',  'strength', ['triceps'],                    [],                                 3.5);
  ex('Dumbbell Pullover',          'reps',  'strength', ['lats','chest'],               ['triceps'],                        4.0);
  ex('Dumbbell Step-Up',           'reps',  'strength', ['quads','glutes'],             ['hamstrings','calves'],            5.0);
  ex('Dumbbell Shrug',             'reps',  'strength', ['upper_back'],                 [],                                 3.5);

  // ── Strength — Kettlebell ───────────────────────────────────────────────────
  ex('Kettlebell Swing',           'reps',  'strength', ['glutes','hamstrings'],        ['lower_back','core'],              6.0);
  ex('Kettlebell Goblet Squat',    'reps',  'strength', ['quads','glutes'],             ['core'],                           5.0);
  ex('Kettlebell Clean and Press', 'reps',  'strength', ['shoulders','glutes'],         ['core','triceps'],                 5.5);
  ex('Kettlebell Turkish Get-Up',  'reps',  'strength', ['shoulders','core'],           ['glutes','hip_flexor'],            5.0);
  ex('Kettlebell Snatch',          'reps',  'strength', ['glutes','shoulders'],         ['core','upper_back'],              6.5);
  ex('Kettlebell Deadlift',        'reps',  'strength', ['hamstrings','glutes'],        ['lower_back'],                     5.0);
  ex('Kettlebell Row',             'reps',  'strength', ['upper_back','lats'],          ['biceps'],                         4.5);
  ex('Kettlebell Windmill',        'reps',  'strength', ['core','shoulders'],           ['hamstrings','glutes'],            4.0);
  ex('Kettlebell Halo',            'reps',  'strength', ['shoulders','core'],           ['upper_back'],                     3.5);
  ex('Kettlebell Figure-8',        'reps',  'strength', ['core','glutes'],              ['lower_back'],                     5.0);

  // ── Strength — Cable / Lat Pulldown ─────────────────────────────────────────
  ex('Lat Pulldown (Wide Grip)',   'reps',  'strength', ['lats'],                       ['biceps','upper_back'],            4.5);
  ex('Lat Pulldown (Close Grip)',  'reps',  'strength', ['lats','biceps'],              ['upper_back'],                     4.5);
  ex('Seated Cable Row',           'reps',  'strength', ['upper_back','lats'],          ['biceps','rear_delts'],            4.5);
  ex('Face Pull',                  'reps',  'strength', ['rear_delts','upper_back'],    ['rotator_cuff'],                   3.5);
  ex('Cable Tricep Pushdown',      'reps',  'strength', ['triceps'],                    ['forearms'],                       3.5);
  ex('Cable Curl',                 'reps',  'strength', ['biceps'],                     ['forearms'],                       3.5);
  ex('Straight-Arm Pulldown',      'reps',  'strength', ['lats'],                       ['triceps'],                        4.0);
  ex('Cable Fly',                  'reps',  'strength', ['chest'],                      ['shoulders'],                      4.0);
  ex('Cable Row (Single Arm)',     'reps',  'strength', ['upper_back','lats'],          ['biceps','rear_delts'],            4.5);

  // ── Strength — Bodyweight ───────────────────────────────────────────────────
  ex('Pull-Up',                    'reps',  'strength', ['lats','upper_back'],          ['biceps','rear_delts'],            5.0);
  ex('Chin-Up',                    'reps',  'strength', ['lats','biceps'],              ['upper_back'],                     5.0);
  ex('Push-Up',                    'reps',  'strength', ['chest','triceps'],            ['shoulders','core'],               4.5);
  ex('Dip',                        'reps',  'strength', ['triceps','chest'],            ['shoulders'],                      4.5);
  ex('Inverted Row',               'reps',  'strength', ['upper_back','lats'],          ['biceps','rear_delts'],            4.5);
  ex('Pistol Squat',               'reps',  'strength', ['quads','glutes'],             ['hamstrings','core'],              5.5);
  ex('Nordic Curl',                'reps',  'strength', ['hamstrings'],                 ['glutes','calves'],                4.5);

  // ── Core / Stability ────────────────────────────────────────────────────────
  ex('Plank',                      'timed', 'strength', ['core'],                       ['shoulders','glutes'],             3.5);
  ex('Side Plank',                 'timed', 'strength', ['core'],                       ['shoulders'],                      3.5);
  ex('Hollow Hold',                'timed', 'strength', ['core'],                       [],                                 3.5);
  ex('Dead Bug',                   'reps',  'strength', ['core'],                       ['hip_flexor'],                     3.0);
  ex('Hanging Knee Raise',         'reps',  'strength', ['core','hip_flexor'],          [],                                 3.5);
  ex('Hanging Leg Raise',          'reps',  'strength', ['core','hip_flexor'],          [],                                 4.0);
  ex('Ab Wheel Rollout',           'reps',  'strength', ['core'],                       ['shoulders','lats'],               4.0);
  ex('Mountain Climbers',          'timed', 'strength', ['core','quads'],               ['shoulders'],                      5.0);

  // ── Cardio ──────────────────────────────────────────────────────────────────
  ex('Running',                    'timed', 'cardio',   ['quads','calves'],             ['glutes','hamstrings','core'],     8.0);
  ex('Cycling (Stationary)',       'timed', 'cardio',   ['quads','calves'],             ['glutes','hamstrings'],            7.0);
  ex('Rowing (Erg)',               'timed', 'cardio',   ['upper_back','core','glutes'], ['hamstrings','shoulders'],         7.0);
  ex('Jump Rope',                  'timed', 'cardio',   ['calves','quads'],             ['shoulders','core'],              10.0);
  ex('Burpees',                    'reps',  'cardio',   ['chest','quads','core'],       ['shoulders','glutes'],             8.0);
  ex('Box Jump',                   'reps',  'cardio',   ['quads','glutes'],             ['calves','hamstrings'],            8.0);
  ex('Sled Push',                  'timed', 'cardio',   ['quads','glutes'],             ['hamstrings','core','shoulders'],  7.0);

  // ── Cooldown ────────────────────────────────────────────────────────────────
  ex('Standing Quad Stretch',      'timed', 'cooldown', ['quads'],                      [],                                 2.0);
  ex('Seated Hamstring Stretch',   'timed', 'cooldown', ['hamstrings'],                 ['lower_back'],                     2.0);
  ex('Hip Flexor Stretch',         'timed', 'cooldown', ['hip_flexor'],                 ['quads'],                          2.0);
  ex('Pigeon Pose',                'timed', 'cooldown', ['glutes','hip_flexor'],         [],                                 2.0);
  ex("Child's Pose",               'timed', 'cooldown', ['lower_back','lats'],           [],                                 2.0);
  ex('Doorway Chest Stretch',      'timed', 'cooldown', ['chest','shoulders'],           [],                                 2.0);
  ex('Standing Calf Stretch',      'timed', 'cooldown', ['calves'],                      [],                                 2.0);
  ex('Seated Figure-4 Stretch',    'timed', 'cooldown', ['glutes'],                      [],                                 2.0);
  ex('Thread the Needle',          'timed', 'cooldown', ['upper_back','shoulders'],      [],                                 2.0);
  ex('Foam Rolling — Quads',       'timed', 'cooldown', ['quads'],                       [],                                 2.5);
  ex('Foam Rolling — IT Band',     'timed', 'cooldown', ['quads'],                       [],                                 2.5);
  ex('Foam Rolling — Upper Back',  'timed', 'cooldown', ['upper_back'],                  [],                                 2.5);
  ex('Foam Rolling — Hamstrings',  'timed', 'cooldown', ['hamstrings'],                  [],                                 2.5);
  ex('Neck Side Stretch',          'timed', 'cooldown', ['upper_back'],                  [],                                 2.0);
  ex('Wrist Flexor Stretch',       'timed', 'cooldown', ['forearms'],                    [],                                 2.0);
})();

module.exports = db;
