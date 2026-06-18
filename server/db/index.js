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

  CREATE TABLE IF NOT EXISTS food_ingredients (
    id                 INTEGER PRIMARY KEY,
    food_id            INTEGER NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    ingredient_food_id INTEGER NOT NULL REFERENCES foods(id),
    quantity           REAL NOT NULL DEFAULT 100
  );
  CREATE INDEX IF NOT EXISTS idx_food_ingredients ON food_ingredients(food_id);
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
  `ALTER TABLE exercises ADD COLUMN description TEXT`,
  `ALTER TABLE exercises ADD COLUMN gif_url TEXT`,
  `ALTER TABLE user_profiles ADD COLUMN sugar_target_g REAL`,
  `ALTER TABLE set_logs ADD COLUMN notes TEXT`,
  `ALTER TABLE set_logs ADD COLUMN actual_rest_seconds INTEGER`,
  // Macro toggle system: per-user tracking prefs + new target columns
  `ALTER TABLE user_profiles ADD COLUMN tracked_macros TEXT`,
  `ALTER TABLE user_profiles ADD COLUMN added_sugar_target_g REAL`,
  `ALTER TABLE user_profiles ADD COLUMN saturated_fat_target_g REAL`,
  `ALTER TABLE user_profiles ADD COLUMN cholesterol_target_mg REAL`,
  `ALTER TABLE user_profiles ADD COLUMN potassium_target_mg REAL`,
  // Added sugar (NULL = unknown, not zero — most library foods won't have this set)
  `ALTER TABLE foods ADD COLUMN added_sugar_g REAL`,
  `ALTER TABLE meal_items ADD COLUMN added_sugar_g REAL`,
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
  INSERT INTO exercises (name, exercise_type, category, primary_muscles, secondary_muscles, met_value, description)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const setCat = db.prepare(`UPDATE exercises SET category = ? WHERE name = ?`);
const setDesc = db.prepare(`UPDATE exercises SET description = ? WHERE name = ? AND (description IS NULL OR description = '')`);

function ex(name, type, cat, pri, sec, met, desc = null) {
  if (!checkEx.get(name)) {
    insertEx.run(name, type, cat, JSON.stringify(pri), JSON.stringify(sec), met, desc);
  }
  setCat.run(cat, name);
  if (desc) setDesc.run(desc, name);
}

db.transaction(() => {
  // ── Warmup ──────────────────────────────────────────────────────────────────
  ex('Jumping Jacks',              'timed', 'warmup', ['quads','calves'],              ['core','shoulders'],          2.5,
    'Stand upright, feet together. Jump feet wide while raising arms overhead — then jump back to start. Keep a slight knee bend on landing. Breathe rhythmically; aim for a comfortable pace to gradually raise heart rate.');
  ex('Arm Circles',                'timed', 'warmup', ['shoulders'],                   ['rotator_cuff'],              2.5,
    'Stand tall with arms extended out to the sides. Make small circles forward for half the time, then reverse direction. Gradually increase circle size. Keep chest open and core lightly braced throughout.');
  ex('Leg Swings',                 'reps',  'warmup', ['hip_flexor','glutes'],          ['hamstrings'],                2.5,
    'Hold a wall or rack for balance. Swing one leg forward and back in a controlled arc, gradually increasing range. Keep the standing leg slightly bent. 10–15 reps per leg. Excellent for hip mobility before squats and deadlifts.');
  ex('Hip Circles',                'timed', 'warmup', ['hip_flexor','glutes'],          ['core'],                      2.5,
    'Feet shoulder-width apart, hands on hips. Draw large circles with your hips — think hula hoop motion. Complete full circles in one direction, then reverse. Great for lubricating hip joints before lower-body work.');
  ex('Inchworm',                   'reps',  'warmup', ['hamstrings','core'],            ['shoulders','lower_back'],    3.0,
    'Stand tall, hinge at hips and touch the floor. Walk hands forward to a push-up position. Optionally add a push-up. Walk feet back to hands. Return to standing. Keep legs as straight as possible. 5–8 reps.');
  ex("World's Greatest Stretch",   'reps',  'warmup', ['hip_flexor','upper_back'],      ['hamstrings','shoulders'],    3.0,
    'Step into a deep lunge. Place same-side hand on the floor. Rotate the opposite arm toward the ceiling, following with your eyes. Hold 2 seconds, then switch arms. Returns to standing. 5 reps per side. Mobilizes nearly every joint.');
  ex('Cat-Cow',                    'reps',  'warmup', ['lower_back','core'],            [],                            2.0,
    'On all fours, wrists under shoulders, knees under hips. Inhale — drop belly, lift chest and tailbone (Cow). Exhale — round spine toward ceiling, tuck chin and pelvis (Cat). Move slowly and deliberately. 10 reps.');
  ex('Thoracic Rotation',          'reps',  'warmup', ['upper_back'],                   ['shoulders','core'],          2.5,
    'Sit or kneel. Place one hand behind your head. Rotate your upper back (not just your shoulder) to open your elbow toward the ceiling. Hold 1 second at end range. Return. 8–10 reps per side. Targets the thoracic spine directly.');
  ex('Glute Bridge (Bodyweight)',  'reps',  'warmup', ['glutes'],                       ['hamstrings','core'],         3.0,
    'Lie on your back, knees bent, feet flat, hip-width apart. Drive through heels to lift hips until body forms a straight line from knees to shoulders. Squeeze glutes hard at the top. Lower slowly. 15 reps. Activates glutes before squats/deadlifts.');
  ex('Band Pull-Apart',            'reps',  'warmup', ['rear_delts','upper_back'],      ['rotator_cuff'],              2.5,
    'Hold a resistance band at shoulder width, arms straight in front. Pull band apart by retracting shoulder blades — squeeze at full stretch. Control the return. 15–20 reps. Essential pre-bench and overhead warm-up for shoulder health.');
  ex('Hip Flexor Lunge (Dynamic)', 'reps',  'warmup', ['hip_flexor','quads'],           ['glutes'],                    3.0,
    'Step into a long lunge. Drop the back knee toward the floor. Push hips forward and down to stretch the hip flexor. Hold 1–2 seconds. Return to standing and switch legs. 8 reps per side. Counteracts sitting and prepares hips for squats.');
  ex('Bodyweight Squat',           'reps',  'warmup', ['quads','glutes'],               ['hamstrings','core'],         3.5,
    'Feet shoulder-width, toes slightly out. Brace core, sit hips back and down — chest tall, knees tracking over toes. Reach depth where thighs are parallel or below. Drive through mid-foot to stand. 10–15 reps as movement prep.');
  ex('Scapular Pull-Up',           'reps',  'warmup', ['upper_back','lats'],            ['shoulders'],                 3.0,
    'Hang from a pull-up bar with straight arms. Without bending elbows, depress and retract your shoulder blades to "shrug" upward an inch. Slowly lower back to dead hang. 10 reps. Activates lats and preps scapular stabilizers before pulling work.');

  // ── Strength — Barbell / Squat Rack ─────────────────────────────────────────
  ex('Back Squat',                 'reps',  'strength', ['quads','glutes'],             ['hamstrings','core','lower_back'], 5.5,
    'Bar rests on upper traps (high bar) or rear delts (low bar). Feet shoulder-to-hip width, toes out 15–30°. Big breath, brace core hard. Break at hips and knees simultaneously — chest tall, knees out. Hit parallel or below. Drive through mid-foot, keep knees over toes. Lock out hips fully at the top.\n\n⚠️ Common mistakes: Butt wink (excessive pelvic tuck at depth), knees caving, heels rising, forward lean. Fix with ankle mobility work and bar position adjustment.');
  ex('Front Squat',                'reps',  'strength', ['quads','core'],               ['glutes','upper_back'],            5.5,
    'Bar rests on front delts — elbows high and forward (clean grip or cross-arm). Feet slightly narrower than back squat. Demand on core and upper back is extreme — elbows dropping = bar rolling forward. Squat straight down, very upright torso. Requires significant wrist, thoracic, and ankle mobility.\n\n⚠️ Common mistakes: Elbows dropping, heel rise, forward collapse of torso. Work on wrist flexibility if using clean grip.');
  ex('Pause Squat',                'reps',  'strength', ['quads','glutes'],             ['hamstrings','core'],              5.5,
    'Execute a back squat to full depth. Pause for 2–3 seconds at the bottom — completely still, no bounce. Maintain full brace and position. Drive out of the hole with maximum intent. Pause squats eliminate the stretch reflex and build strength at the hardest position. Use 70–80% of normal squat weight.');
  ex('Overhead Press',             'reps',  'strength', ['shoulders','triceps'],        ['core','upper_back'],              4.5,
    'Bar at clavicle height. Grip just outside shoulders. Elbows slightly in front of bar. Brace core and glutes — no lower-back arch. Press bar straight up past your face (not in front). As bar clears your forehead, drive head through to finish with bar over mid-foot, arms locked, ears between arms.\n\n⚠️ Common mistakes: Excessive back arch, bar path drifting forward, not locking out fully. Weak overhead press often indicates tight lats or poor thoracic mobility.');
  ex('Bench Press',                'reps',  'strength', ['chest','triceps'],            ['shoulders'],                      5.0,
    'Lie on bench, eyes under bar. Grip 1–2 finger-widths outside shoulder-width. Feet flat on floor. Retract and depress shoulder blades — create a stable arch. Unrack bar over lower chest/upper abs touch point. Lower with control, elbows 45–75° from torso. Touch chest — no bounce. Drive feet into floor and press to lockout.\n\n⚠️ Common mistakes: Flared elbows (shoulder injury risk), bouncing bar off chest, losing upper-back tightness, wrists bent back.');
  ex('Close-Grip Bench Press',     'reps',  'strength', ['triceps','chest'],            ['shoulders'],                      4.5,
    'Same setup as bench press but grip is shoulder-width or slightly inside. Elbows tuck tighter — about 30–45° from torso. Lower bar to lower chest/upper-ab area. Triceps do more work due to reduced pec contribution. Great tricep builder that also reinforces a healthier bench press elbow path.');
  ex('Deadlift',                   'reps',  'strength', ['hamstrings','glutes','lower_back'], ['core','upper_back'],        6.0,
    'Bar over mid-foot (~1 inch from shins). Hip-width stance. Hinge to bar, grip just outside legs. Straight arms, neutral spine, lats engaged ("protect your armpits"). Drive floor away — hips and shoulders rise at same rate. Bar stays in contact with legs. Lock out hips and knees simultaneously at the top.\n\n⚠️ Common mistakes: Bar drifting away from body, hips rising before shoulders (stiff-leg deadlift), rounding lower back. Fix with lat engagement cue and appropriate weight.');
  ex('Romanian Deadlift',          'reps',  'strength', ['hamstrings','glutes'],        ['lower_back'],                     5.0,
    'Start standing with bar at hips. Hinge at hips while keeping bar close to legs — slight knee bend (not a squat). Feel hamstrings stretch, lower until bar is just below knees (range varies with flexibility). Drive hips forward to return. Maintain neutral spine throughout — no rounding.\n\n💡 Focus on feeling the hamstring stretch, not how low you go. Spine position is non-negotiable.');
  ex('Rack Pull',                  'reps',  'strength', ['upper_back','hamstrings'],    ['glutes','core'],                  5.5,
    'Set pins so bar starts at knee height. Same setup as deadlift. Emphasizes upper back and lockout. Allows heavier loads than full deadlift — great for building grip and upper-back strength. Keep lats tight, drive hips forward at top.');
  ex('Good Morning',               'reps',  'strength', ['hamstrings','lower_back'],    ['glutes'],                         4.0,
    'Bar on upper traps (like back squat). Feet hip-width. Hinge at hips with a slight knee bend, lower torso toward parallel — back stays neutral. Feel hamstring stretch. Drive hips forward to return. Use moderate weight — this is a hip hinge teacher, not a max-effort lift. Common accessory for deadlift and squat.');
  ex('Bent-Over Barbell Row',      'reps',  'strength', ['upper_back','lats'],          ['biceps','rear_delts'],            5.0,
    'Hinge until torso is 45–60° from floor. Bar hangs from arms. Pull bar to lower chest/upper abdomen — elbows drive back past torso. Hold 1 second at top. Lower with control. Keep back neutral and avoid bouncing reps.\n\n⚠️ Common mistakes: Standing too upright (turns it into a shrug), using momentum, rounding the lower back.');
  ex('Barbell Hip Thrust',         'reps',  'strength', ['glutes'],                     ['hamstrings','core'],              4.5,
    'Sit against a bench with bar across hip crease (use pad). Feet flat, shoulder-width, toes slightly out. Drive through heels — squeeze glutes hard at the top until hips are fully extended. Body forms a straight line from knees to shoulders. Lower slowly. Do not hyperextend lower back at lockout — it\'s a glute squeeze, not a back arch.');
  ex('Barbell Curl',               'reps',  'strength', ['biceps'],                     ['forearms'],                       3.5,
    'Stand with bar at hip level, underhand grip shoulder-width. Keep elbows pinned at sides. Curl bar toward chin — squeeze biceps. Lower slowly (3 seconds). No swinging — if you need to swing, it\'s too heavy. Fully extend arms at bottom to maximize range of motion.');
  ex('Barbell Lunge',              'reps',  'strength', ['quads','glutes'],             ['hamstrings','calves'],            5.0,
    'Bar on traps. Step forward into a long stride. Lower back knee toward floor (hover, don\'t touch). Front knee tracks over toes. Drive through front heel to return. Alternate legs or complete all reps on one side. Keep torso upright — forward lean shifts load to glutes (not bad, but be intentional).');
  ex('Zercher Squat',              'reps',  'strength', ['quads','biceps','core'],      ['glutes','upper_back'],            5.5,
    'Bar held in the crook of your elbows, arms crossed or clasped. The front-loaded position creates massive core and upper-back demand. Squat to depth — elbows may touch inner thighs. Very upright torso required. Uncomfortable at first; use a bar pad or towel until adapted.');
  ex('Power Clean',                'reps',  'strength', ['glutes','hamstrings','shoulders'], ['core','upper_back','quads'], 6.0,
    'Start like a deadlift. Explosively extend hips and knees, shrug shoulders, then pull elbows around and under the bar as it rises to shoulder height (catch in a quarter-squat). Timing and hip explosion are everything. Practice technique with lighter weights. Olympic lifting coach recommended for beginners.');

  // ── Strength — Dumbbell ──────────────────────────────────────────────────────
  ex('Dumbbell Bench Press',       'reps',  'strength', ['chest','triceps'],            ['shoulders'],                      5.0,
    'Lie on bench, dumbbells at shoulder level, elbows ~60° from torso. Retract shoulder blades. Press up and slightly inward until arms are fully extended — but don\'t let dumbbells crash together. Lower slowly. Greater range of motion than barbell. Control the descent; don\'t drop at the bottom.');
  ex('Incline Dumbbell Press',     'reps',  'strength', ['chest','triceps'],            ['shoulders'],                      5.0,
    'Bench set to 30–45°. Same mechanics as flat dumbbell press. The angle shifts emphasis to the upper chest and front delts. Avoid going past 45° — it becomes a shoulder press. Control the eccentric and feel the stretch at the bottom.');
  ex('Dumbbell Fly',               'reps',  'strength', ['chest'],                      ['shoulders'],                      4.0,
    'Lie flat, dumbbells above chest with slight bend in elbows (maintain this angle throughout — do NOT bend more). Open arms in a wide arc until you feel chest stretch. Squeeze pecs to bring dumbbells back together. This is an isolation exercise — use lighter weight than press movements.');
  ex('Single-Arm Dumbbell Row',    'reps',  'strength', ['lats','upper_back'],          ['biceps','rear_delts'],            4.5,
    'Brace knee and hand on bench. Dumbbell hanging from other arm. Row dumbbell to hip — elbow drives back past torso. At the top, squeeze for 1 second. Lower fully. Keep torso parallel to floor — don\'t rotate to swing the weight. Full arm extension at bottom for maximum lat stretch.');
  ex('Dumbbell Lateral Raise',     'reps',  'strength', ['shoulders'],                  ['rear_delts'],                     3.5,
    'Stand with dumbbells at sides. Slight bend in elbows (maintain throughout). Raise arms out to sides to shoulder height — lead with elbows, not wrists. Pinky slightly higher than thumb at top. Lower slowly. Avoid shrugging or using momentum. Go lighter than you think — this is an isolation move.');
  ex('Dumbbell Front Raise',       'reps',  'strength', ['shoulders'],                  [],                                 3.5,
    'Dumbbells at thighs, palms facing body. Raise one or both arms to shoulder height (no higher). Keep slight bend in elbow. Lower slowly. Avoid swinging. Hits the anterior deltoid — pair with lateral raises and rear delt work for balanced shoulder development.');
  ex('Dumbbell Rear Delt Fly',     'reps',  'strength', ['rear_delts'],                 ['upper_back'],                     3.5,
    'Hinge forward 45–90°. Dumbbells hanging below chest. Keep slight bend in elbows. Raise arms out to sides — think about pulling elbows apart and back. Squeeze rear delts at top. Lower slowly. Often done with face pulls; critical for shoulder health and posture correction.');
  ex('Dumbbell Curl',              'reps',  'strength', ['biceps'],                     ['forearms'],                       3.5,
    'Dumbbells at sides, supinated grip. Keep elbows pinned at sides. Curl both (or alternate) dumbbells toward shoulders — squeeze at top. Lower slowly with full extension. Supinate wrist as you curl (rotate palm up from neutral). The supination engages the bicep more than a hammer grip.');
  ex('Hammer Curl',                'reps',  'strength', ['biceps','forearms'],          [],                                 3.5,
    'Neutral grip (palms facing each other). Curl dumbbells toward shoulders keeping palms facing in throughout. Hits the brachialis and brachioradialis heavily — the muscles that create that "thick arm" look below the bicep. Great complement to standard curls.');
  ex('Dumbbell Shoulder Press',    'reps',  'strength', ['shoulders'],                  ['triceps'],                        4.5,
    'Seated or standing with dumbbells at shoulder level, palms forward. Press straight up until arms extend fully. Control the descent. Avoid arching excessively — brace core. Seated version reduces cheating; standing adds core demand. Slightly narrower grip than barbell OHP is natural.');
  ex('Dumbbell Romanian Deadlift', 'reps',  'strength', ['hamstrings','glutes'],        ['lower_back'],                     5.0,
    'Stand with dumbbells at thighs. Hinge at hips — dumbbells slide down your legs (keep them close). Slight knee bend. Feel hamstrings load. Lower to mid-shin or until back rounds (whichever comes first). Drive hips forward. Keep chest up and core braced throughout.');
  ex('Dumbbell Lunge',             'reps',  'strength', ['quads','glutes'],             ['hamstrings','calves'],            5.0,
    'Dumbbells at sides. Step forward into a lunge — back knee hovers above floor. Front knee over toes. Drive through front heel to return or alternate steps. Keep torso upright. Great for unilateral leg development — reveals and fixes left-right strength imbalances.');
  ex('Goblet Squat',               'reps',  'strength', ['quads','glutes'],             ['core'],                           5.0,
    'Hold one dumbbell vertically at chest level with both hands. Feet shoulder-width, toes out. Squat deep — elbows track inside knees at bottom. Chest stays up due to counterbalance effect. Excellent teaching tool for squat mechanics and great finisher for quad/glute work. Pause at bottom for extra mobility benefit.');
  ex('Dumbbell Tricep Kickback',   'reps',  'strength', ['triceps'],                    [],                                 3.5,
    'Hinge forward, upper arm parallel to floor. Extend forearm back until arm is straight — squeeze tricep. Lower slowly. The key is keeping the upper arm stationary and parallel to the floor — if it drops, you lose tricep isolation. Use lighter weight than you expect.');
  ex('Dumbbell Pullover',          'reps',  'strength', ['lats','chest'],               ['triceps'],                        4.0,
    'Lie across or along bench, one dumbbell held with both hands above chest. Lower dumbbell in an arc behind your head — feel lat/chest stretch. Pull back to start. Keep slight bend in elbows. A rare exercise that hits both lats and chest. Avoid if you have shoulder impingement.');
  ex('Dumbbell Step-Up',           'reps',  'strength', ['quads','glutes'],             ['hamstrings','calves'],            5.0,
    'Stand in front of a box or bench. Place one foot fully on the surface. Drive through that heel to step up — don\'t push off back foot. Step down with control. Complete all reps on one leg before switching. Box height should allow your thigh to be parallel or higher at start position.');
  ex('Dumbbell Shrug',             'reps',  'strength', ['upper_back'],                 [],                                 3.5,
    'Dumbbells at sides. Elevate shoulders straight up toward ears — no rolling, no forward/backward motion. Hold 1 second at top. Lower slowly. Targets the upper trapezius. Rolling shrugs can strain the shoulder joint — keep it strictly vertical.');

  // ── Strength — Kettlebell ───────────────────────────────────────────────────
  ex('Kettlebell Swing',           'reps',  'strength', ['glutes','hamstrings'],        ['lower_back','core'],              6.0,
    'Hike kettlebell back between legs (like a long snap in football). Explosively drive hips forward — the hip extension, not arm lift, sends the bell to shoulder height. Let it fall back and hike again immediately. This is a HINGE, not a squat. Back stays neutral; core stays braced.\n\n⚠️ Common mistakes: Squatting instead of hinging, using arms to lift the bell, rounding lower back. The power comes entirely from hip snap.');
  ex('Kettlebell Goblet Squat',    'reps',  'strength', ['quads','glutes'],             ['core'],                           5.0,
    'Hold kettlebell by the horns at chest height. Squat deep — elbows track inside knees at the bottom. The counterbalance allows a more upright torso and greater depth than many people can achieve otherwise. Excellent for mobility development and high-rep finishing sets.');
  ex('Kettlebell Clean and Press', 'reps',  'strength', ['shoulders','glutes'],         ['core','triceps'],                 5.5,
    'Clean: hike KB back, drive hips forward, guide bell to the "rack" position (bell rests on forearm at shoulder, wrist straight). Press: drive KB overhead from rack. Lock out fully. Return to rack, then hinge to swing position. High technique demand — learn each phase separately before combining.');
  ex('Kettlebell Turkish Get-Up',  'reps',  'strength', ['shoulders','core'],           ['glutes','hip_flexor'],            5.0,
    'Lie with KB pressed above you. Keep KB overhead throughout the entire movement. Progress through: roll to elbow → hand → sweep leg through → kneel → stand. Reverse to return. Move slowly and deliberately. 1 rep should take 30–60 seconds. Outstanding full-body stability and mobility exercise.');
  ex('Kettlebell Snatch',          'reps',  'strength', ['glutes','shoulders'],         ['core','upper_back'],              6.5,
    'Hike KB back, drive hips, and pull KB up the body\'s center line — punch through at the top to "catch" it overhead in one fluid motion. The bell should float to the top, not pull your arm. Learn the one-arm swing and high pull first. Callus protection and good hip power are prerequisites.');
  ex('Kettlebell Deadlift',        'reps',  'strength', ['hamstrings','glutes'],        ['lower_back'],                     5.0,
    'KB on floor between feet. Hinge to grab the handle — hips above knees, shoulders above hips, back neutral. Drive through heels, extend hips and knees simultaneously. Lock out fully. Hinge back to lower. Great intro to the hip hinge pattern. Can be done with two KBs for increased load.');
  ex('Kettlebell Row',             'reps',  'strength', ['upper_back','lats'],          ['biceps'],                         4.5,
    'Hinge to 45°, KB hanging. Row to hip, elbow driving back. Same mechanics as dumbbell row. The KB\'s offset center of mass challenges grip differently than dumbbells — the bell wants to rotate, requiring active forearm control.');
  ex('Kettlebell Windmill',        'reps',  'strength', ['core','shoulders'],           ['hamstrings','glutes'],            4.0,
    'Press KB overhead with one arm, locked out. Feet wide, toes angled slightly. Hinge to the opposite side — sliding same-side hand down your leg. KB stays pointing at the ceiling. Keep your eyes on the bell. Demands shoulder stability, hip mobility, and core strength simultaneously.');
  ex('Kettlebell Halo',            'reps',  'strength', ['shoulders','core'],           ['upper_back'],                     3.5,
    'Hold KB by the horns at chest height. Orbit the bell around your head — close to your head, controlled. Alternate directions. Keeps arms close throughout the circle. Excellent shoulder mobility drill and warm-up. Keep core engaged to prevent lower-back compensation.');
  ex('Kettlebell Figure-8',        'reps',  'strength', ['core','glutes'],              ['lower_back'],                     5.0,
    'Stand with feet wider than shoulder-width. Hinge slightly. Pass KB in a figure-8 pattern between legs, alternating hands at each pass. Stay hinged throughout — this is not a stand-up-and-pass movement. Builds core coordination and grip strength.');

  // ── Strength — Cable / Lat Pulldown ─────────────────────────────────────────
  ex('Lat Pulldown (Wide Grip)',   'reps',  'strength', ['lats'],                       ['biceps','upper_back'],            4.5,
    'Wide overhand grip on bar. Slight lean back (10–15°). Pull bar to upper chest — drive elbows down and back. Squeeze lats at the bottom. Slowly return. Do NOT use momentum or excessive body rocking. The lats initiate the pull, not the biceps.\n\n💡 Cue: "Pull your elbows into your back pockets."');
  ex('Lat Pulldown (Close Grip)',  'reps',  'strength', ['lats','biceps'],              ['upper_back'],                     4.5,
    'Narrow neutral-grip handle. Sit upright or with slight lean back. Pull handles to upper chest — elbows drive straight down. More bicep involvement than wide-grip due to supination. Great variation to alternate with wide grip for complete lat development.');
  ex('Seated Cable Row',           'reps',  'strength', ['upper_back','lats'],          ['biceps','rear_delts'],            4.5,
    'Sit with slight lean forward. Pull handle to lower chest/upper abdomen — elbows drive back past torso. Squeeze shoulder blades together at peak. Slowly extend back forward (don\'t let the stack slam). Avoid rounding forward excessively on the stretch — feel it, don\'t force it.');
  ex('Face Pull',                  'reps',  'strength', ['rear_delts','upper_back'],    ['rotator_cuff'],                   3.5,
    'Cable set at head height or slightly above. Rope attachment. Pull to your face — hands end up beside ears, elbows high and flared. External rotate at the top (think "show your biceps to the ceiling"). This combats internal rotation from pressing and is crucial for shoulder health. Do it every push day.');
  ex('Cable Tricep Pushdown',      'reps',  'strength', ['triceps'],                    ['forearms'],                       3.5,
    'High cable, rope or bar. Elbows pinned at sides. Push handle down until arms are fully extended. Squeeze triceps at lockout. Slowly return. Keep elbows stationary — only the forearms move. Avoid flaring elbows or letting them drift forward.');
  ex('Cable Curl',                 'reps',  'strength', ['biceps'],                     ['forearms'],                       3.5,
    'Low cable, straight bar or EZ-bar. Underhand grip. Curl to chin, squeezing biceps. Lower slowly — the cable maintains tension at the bottom unlike dumbbells. Elbows stay pinned at sides. Great finishing exercise for a constant-tension bicep pump.');
  ex('Straight-Arm Pulldown',      'reps',  'strength', ['lats'],                       ['triceps'],                        4.0,
    'High cable, straight bar or rope. Arms extended, slight bend in elbows. Hinge slightly at hips. Pull bar down to hips in an arc — elbows stay straight throughout. This is pure lat isolation without bicep involvement. Excellent pre-exhaust for lats before rows or pulldowns.');
  ex('Cable Fly',                  'reps',  'strength', ['chest'],                      ['shoulders'],                      4.0,
    'Cables set at chest height (mid) or high for upper chest, low for upper chest. Step forward with slight lean. Arms extended with slight elbow bend — maintain this angle. Bring hands together in front of chest in a hugging motion. Squeeze pecs at center. Slowly return. Better chest isolation than dumbbell flies for many due to constant cable tension.');
  ex('Cable Row (Single Arm)',     'reps',  'strength', ['upper_back','lats'],          ['biceps','rear_delts'],            4.5,
    'One arm at a time with D-handle. Row to hip, rotating torso slightly (anti-rotation core benefit). Allows greater range of motion and corrects left-right imbalances vs. barbell rowing.');

  // ── Strength — Bodyweight ───────────────────────────────────────────────────
  ex('Pull-Up',                    'reps',  'strength', ['lats','upper_back'],          ['biceps','rear_delts'],            5.0,
    'Overhand grip, slightly wider than shoulders. Dead hang to start. Engage lats ("protect your armpits"), then pull chest to bar. Elbows drive down and back. Lower with control — no kipping for strength work. Squeeze shoulder blades at top.\n\n💡 Can\'t do one yet? Use a band or lat pulldown to build strength. Negatives (jump up, lower slowly) are also excellent.');
  ex('Chin-Up',                    'reps',  'strength', ['lats','biceps'],              ['upper_back'],                     5.0,
    'Underhand grip, shoulder-width. Same movement as pull-up but supinated grip increases bicep involvement. Many find this easier than pull-ups. Full dead hang at bottom, chin clears bar at top. Great for building both back and bicep strength simultaneously.');
  ex('Push-Up',                    'reps',  'strength', ['chest','triceps'],            ['shoulders','core'],               4.5,
    'Hands slightly wider than shoulders, fingers forward or slightly angled out. Plank position — rigid body from head to heels. Lower until chest touches or nearly touches floor — elbows at 45° from torso (not fully flared). Push back up fully. Squeeze chest at top.\n\n💡 Progressions: Elevated (easier) → Standard → Weighted → Archer → One-Arm');
  ex('Dip',                        'reps',  'strength', ['triceps','chest'],            ['shoulders'],                      4.5,
    'Grip parallel bars. Slightly forward lean hits more chest; upright torso hits more triceps. Lower yourself until upper arms are parallel to floor. Push back up to full lockout. Keep shoulders depressed — don\'t shrug. Add weight with belt for progression.\n\n⚠️ Avoid if you have shoulder impingement or anterior instability.');
  ex('Inverted Row',               'reps',  'strength', ['upper_back','lats'],          ['biceps','rear_delts'],            4.5,
    'Bar at hip height (in a rack or Smith machine). Lie under bar, overhand grip wider than shoulders. Body in a plank. Pull chest to bar — elbows drive back. Lower slowly. Easier than pull-ups but same muscle groups. Adjust difficulty by raising or lowering bar. Excellent beginner back builder.');
  ex('Pistol Squat',               'reps',  'strength', ['quads','glutes'],             ['hamstrings','core'],              5.5,
    'Balance on one leg with other leg extended in front. Squat on standing leg to full depth while keeping extended leg off the floor. Maintain upright torso — arms forward for counterbalance. Requires exceptional quad strength, balance, and ankle/hip mobility.\n\n💡 Progressions: Box pistol → Assisted pistol → Free pistol');
  ex('Nordic Curl',                'reps',  'strength', ['hamstrings'],                 ['glutes','calves'],                4.5,
    'Kneel on pad, feet anchored (partner holds or use anchor). Keeping body rigid, slowly lower your torso toward the floor by extending at the knees — resist with hamstrings. Catch yourself with hands at the bottom. Pull yourself back up (initially with arms assist). One of the most effective hamstring strengtheners — also a major injury prevention tool for athletes.\n\n⚠️ Start with just 2–3 reps. Hamstring DOMS will be severe.');

  // ── Core / Stability ────────────────────────────────────────────────────────
  ex('Plank',                      'timed', 'strength', ['core'],                       ['shoulders','glutes'],             3.5,
    'Forearms on floor, elbows under shoulders, or hands in push-up position. Body forms a straight line from heels to head. Squeeze glutes, brace abs (push belly button away from your spine). Don\'t let hips sag or pike up. Breathe normally.\n\n💡 If you can hold >90s, add weight on your back or move to harder variations (RKC plank, plank with reach).');
  ex('Side Plank',                 'timed', 'strength', ['core'],                       ['shoulders'],                      3.5,
    'Lie on side, forearm on floor perpendicular to body. Stack feet or stagger them. Lift hips — body forms a straight diagonal line. Free hand on hip or reaching up. Don\'t let hips sag. Hold for time, then switch sides. Builds lateral core stability — essential for spinal health and rotation sports.');
  ex('Hollow Hold',                'timed', 'strength', ['core'],                       [],                                 3.5,
    'Lie on back, lower back pressed into floor. Arms overhead, legs extended. Raise both legs and arms off the floor — the lower back must stay flat (if it arches, lower legs are too low or bent knees as regression). Hold. This is the foundational position in gymnastics and the starting position for many calisthenics skills.');
  ex('Dead Bug',                   'reps',  'strength', ['core'],                       ['hip_flexor'],                     3.0,
    'Lie on back, arms straight up, knees bent at 90° in the air. Lower back pressed into floor throughout. Slowly lower opposite arm and leg toward floor simultaneously — without letting your back arch. Return. Alternate sides. This is anti-extension core training: your job is to prevent back arch, not to "crunch".');
  ex('Hanging Knee Raise',         'reps',  'strength', ['core','hip_flexor'],          [],                                 3.5,
    'Dead hang from pull-up bar. Draw both knees toward chest — don\'t swing to get them up. Lower with control. If you swing, reset before next rep. Progression to hanging leg raise. Build grip, shoulder, and core strength simultaneously.');
  ex('Hanging Leg Raise',          'reps',  'strength', ['core','hip_flexor'],          [],                                 4.0,
    'Dead hang, legs straight. Raise legs to horizontal or above — keep legs straight throughout. Lower with control. No kipping or swinging. One of the best lower ab and hip flexor exercises. Requires significant core strength and grip endurance.');
  ex('Ab Wheel Rollout',           'reps',  'strength', ['core'],                       ['shoulders','lats'],               4.0,
    'Kneel on pad, hold ab wheel under shoulders. Brace core hard. Roll forward — hips drop slightly but back stays neutral. Go as far as you can control, then pull back using core and lats. Never let your lower back sag into extension.\n\n⚠️ This is an advanced exercise. Start with partial range-of-motion rollouts. Do NOT attempt full rollouts until you have a solid plank hold.');
  ex('Mountain Climbers',          'timed', 'strength', ['core','quads'],               ['shoulders'],                      5.0,
    'Push-up position, hands under shoulders. Drive one knee toward chest, then rapidly alternate — like running in place horizontally. Keep hips level — don\'t let them bounce up with each step. Keep core braced. Speed is secondary to control. A great metabolic core exercise.');

  // ── Cardio ──────────────────────────────────────────────────────────────────
  ex('Running',                    'timed', 'cardio',   ['quads','calves'],             ['glutes','hamstrings','core'],     8.0,
    'Land with foot under your center of mass — not in front (overstriding causes braking forces and injury). Lean slightly forward from the ankles, not the waist. Relaxed shoulders and arms swinging forward-back (not across body). Breathe rhythmically — try 3-step inhale, 2-step exhale. Build mileage gradually (no more than 10% weekly increase).');
  ex('Cycling (Stationary)',       'timed', 'cardio',   ['quads','calves'],             ['glutes','hamstrings'],            7.0,
    'Adjust seat height so knee is slightly bent at the bottom of the pedal stroke (not fully extended, not deeply bent). Push through the full pedal circle. Resistance should be high enough that pedaling feels like cycling outdoors — spinning too lightly is inefficient. Keep cadence 70–90 RPM for aerobic base; 90–110 RPM for interval work.');
  ex('Rowing (Erg)',               'timed', 'cardio',   ['upper_back','core','glutes'], ['hamstrings','shoulders'],         7.0,
    'Drive sequence: Legs → Back → Arms. Recovery sequence: Arms → Back → Legs. At the catch (start): shins vertical, arms straight, slight forward lean. Drive: push legs down first, then swing back, then pull handle to lower ribs. Catch: arms straighten first, then lean forward, then slide knees up. Avoid rushing the slide — power comes from the drive, not the speed of the catch.');
  ex('Jump Rope',                  'timed', 'cardio',   ['calves','quads'],             ['shoulders','core'],              10.0,
    'Jump on the balls of your feet — barely off the ground (just enough clearance for the rope). Small, fast wrists rotate the rope — not large arm circles. Land softly with slight knee bend. Start with 30s on / 30s off until you can sustain 2–3 minutes. Double-unders: wait for the rope to pass, jump higher, and spin wrists twice per jump.');
  ex('Burpees',                    'reps',  'cardio',   ['chest','quads','core'],       ['shoulders','glutes'],             8.0,
    'Squat down, place hands on floor, jump feet back to push-up position. Optional push-up. Jump feet back to hands. Explosively jump up with arms overhead. The key is maintaining a fluid sequence without stopping. Reduce intensity by stepping instead of jumping if needed. One of the highest-calorie burn exercises per minute.');
  ex('Box Jump',                   'reps',  'cardio',   ['quads','glutes'],             ['calves','hamstrings'],            8.0,
    'Stand 1–2 feet from box. Hinge hips, swing arms back. Explosively drive arms up, extend hips, and jump — land softly on box with bent knees (absorb the impact). Step down (don\'t jump down from height — landing impact is too high). Start with lower boxes and focus on landing mechanics before adding height.\n\n⚠️ Most box jump injuries happen landing — prioritize soft landing over box height.');
  ex('Sled Push',                  'timed', 'cardio',   ['quads','glutes'],             ['hamstrings','core','shoulders'],  7.0,
    'Load sled, grip handles at hip height. Lean forward at 45°. Drive legs powerfully — short, powerful strides. Stay low. This is brutal for conditioning. No eccentric component = minimal soreness, maximal conditioning. Rest 1:3 work:rest ratio. Load heavy for strength; light for conditioning.');

  // ── Cooldown ────────────────────────────────────────────────────────────────
  ex('Standing Quad Stretch',      'timed', 'cooldown', ['quads'],                      [],                                 2.0,
    'Stand on one leg (hold a wall for balance). Bend other knee, grasp foot behind you, pull heel toward glute. Hips stay level — don\'t let them flare to the side. Feel the stretch along the front of the thigh. Hold 30–60 seconds per side. Most effective after leg day.');
  ex('Seated Hamstring Stretch',   'timed', 'cooldown', ['hamstrings'],                 ['lower_back'],                     2.0,
    'Sit on floor, one leg extended, other foot against inner thigh. Hinge at hips (not waist) to reach toward the extended foot — keep spine long. Feel the stretch in the hamstring, not the lower back. If your back rounds excessively, sit on a yoga block. Hold 30–60 seconds per side.');
  ex('Hip Flexor Stretch',         'timed', 'cooldown', ['hip_flexor'],                 ['quads'],                          2.0,
    'Step into a lunge, back knee on floor. Tuck posterior pelvis slightly (squeeze glute on the back leg side). Push hips forward gently — feel the stretch in the front of the back hip. Keep torso upright. Hold 30–60 seconds. Critical after sitting all day or heavy squat/deadlift sessions.');
  ex('Pigeon Pose',                'timed', 'cooldown', ['glutes','hip_flexor'],         [],                                 2.0,
    'From all fours, bring one knee forward to the same-side wrist, shin angled across the mat. Extend back leg straight. Lower hips toward floor (use a block under hip if needed). Sink into the stretch — deep glute and external hip rotator release. Hold 60–90 seconds per side. Transformative for hip tightness from squats/running.');
  ex("Child's Pose",               'timed', 'cooldown', ['lower_back','lats'],           [],                                 2.0,
    'Kneel, sit hips back toward heels, extend arms forward on the floor, forehead resting down. Breathe into your lower back — feel it expand with each inhale. For a lat stretch, walk arms to one side and hold. One of the most restorative poses — use it between heavy sets or at the end of any workout.');
  ex('Doorway Chest Stretch',      'timed', 'cooldown', ['chest','shoulders'],           [],                                 2.0,
    'Stand in a doorway, forearms on the frame (elbows at 90°). Step through slightly, letting pecs open. Don\'t lean excessively — the stretch is the opening of the chest, not back extension. Hold 30–60 seconds. Essential counter-stretch after any pressing work to prevent rounded shoulders.');
  ex('Standing Calf Stretch',      'timed', 'cooldown', ['calves'],                      [],                                 2.0,
    'Place foot on a wall or step edge (toes elevated). Keep heel down and leg straight. Lean toward the wall. For the soleus (deep calf), bend the knee slightly with heel still down. Hold 30–60 seconds per leg. Important for ankle mobility and preventing plantar fasciitis.');
  ex('Seated Figure-4 Stretch',    'timed', 'cooldown', ['glutes'],                      [],                                 2.0,
    'Sit in a chair. Cross one ankle over the opposite knee, forming a "4." Sit tall and gently push down on the raised knee OR lean forward slightly from the hips. Feel the stretch in the outer hip/glute. Hold 30–60 seconds per side. Great desk-friendly alternative to pigeon pose.');
  ex('Thread the Needle',          'timed', 'cooldown', ['upper_back','shoulders'],      [],                                 2.0,
    'All fours. Slide one arm under your body along the floor — let your shoulder and ear rest on the ground. Hold the thoracic rotation stretch. Other hand can press on the floor to deepen. Hold 30–60 seconds per side. Targets thoracic rotation restriction — common in desk workers and heavy lifters.');
  ex('Foam Rolling — Quads',       'timed', 'cooldown', ['quads'],                       [],                                 2.5,
    'Face down, foam roller under thighs. Prop on forearms. Roll slowly from hip to just above knee. When you find a tender spot, pause and breathe — wait for it to release (10–20 seconds). Don\'t roll too fast. Roll one leg at a time for better pressure control.');
  ex('Foam Rolling — IT Band',     'timed', 'cooldown', ['quads'],                       [],                                 2.5,
    'Side lying, roller on outer thigh between hip and knee. This is often extremely tender. Roll slowly. When you find a knot, hold position and breathe. Note: the IT band itself doesn\'t stretch, but rolling the TFL (at the hip) and the vastus lateralis (quad) provides relief. Roll in short sections.');
  ex('Foam Rolling — Upper Back',  'timed', 'cooldown', ['upper_back'],                  [],                                 2.5,
    'Sit on floor, roller at mid-back. Support head with hands behind it. Roll slowly from lower thoracic to upper thoracic. Avoid rolling the lumbar spine directly. You can extend slightly over the roller at each thoracic segment for a gentle mobilization. Excellent for posture and relief after pressing.');
  ex('Foam Rolling — Hamstrings',  'timed', 'cooldown', ['hamstrings'],                  [],                                 2.5,
    'Sit on floor, roller under thighs. Prop on hands. Roll from just above the knee to the base of the glutes. Rotate the leg slightly inward/outward to hit different parts of the hamstring. Pause on tender spots. Stack feet for more pressure if needed.');
  ex('Neck Side Stretch',          'timed', 'cooldown', ['upper_back'],                  [],                                 2.0,
    'Sit or stand tall. Drop one ear toward the shoulder — don\'t raise the shoulder to meet the ear. Hold 20–30 seconds. Add gentle pressure with hand for more intensity. Switch sides. Never roll the neck forward in a full circle — this can compress cervical discs.');
  ex('Wrist Flexor Stretch',       'timed', 'cooldown', ['forearms'],                    [],                                 2.0,
    'Extend one arm forward, palm up. With the other hand, gently pull fingers back toward you. Feel the stretch on the inside of the forearm. Hold 20–30 seconds per side. Essential after grip-heavy sessions (deadlifts, rows, curls) and for desk workers.');
})();

// ─── Exercise animation images ────────────────────────────────────────────────
// Locally-hosted animated GIFs (downloaded via server/scripts/download-exercise-gifs.py
// from hasaneyldrm/exercises-dataset — non-commercial license, fine for this personal
// app) live in client/public/exercises/ and are served at /exercises/*.gif.
// A small remote fallback (yuhonas/free-exercise-db, CC0) covers the handful of
// exercises with no local GIF match.
// setGif always overwrites — these are app-managed visuals, not user content.
{
  const setGif = db.prepare(`UPDATE exercises SET gif_url = ? WHERE name = ?`);

  const LOCAL_GIFS = {
    'Back Squat':                 'back-squat',
    'Bench Press':                'bench-press',
    'Close-Grip Bench Press':     'close-grip-bench-press',
    'Deadlift':                   'deadlift',
    'Romanian Deadlift':          'romanian-deadlift',
    'Overhead Press':             'overhead-press',
    'Good Morning':               'good-morning',
    'Bent-Over Barbell Row':      'bent-over-barbell-row',
    'Barbell Curl':               'barbell-curl',
    'Barbell Lunge':              'barbell-lunge',
    'Barbell Shrug':              'barbell-shrug',
    'Power Clean':                'power-clean',
    'Front Squat':                'front-squat',
    'Zercher Squat':              'zercher-squat',
    'Barbell Hip Thrust':         'barbell-hip-thrust',
    'Dumbbell Bench Press':       'dumbbell-bench-press',
    'Incline Dumbbell Press':     'incline-dumbbell-press',
    'Dumbbell Fly':               'dumbbell-fly',
    'Dumbbell Lateral Raise':     'dumbbell-lateral-raise',
    'Dumbbell Front Raise':       'dumbbell-front-raise',
    'Dumbbell Rear Delt Fly':     'dumbbell-rear-delt-fly',
    'Dumbbell Curl':              'dumbbell-curl',
    'Hammer Curl':                'hammer-curl',
    'Dumbbell Shoulder Press':    'dumbbell-shoulder-press',
    'Dumbbell Romanian Deadlift': 'dumbbell-romanian-deadlift',
    'Dumbbell Lunge':             'dumbbell-lunge',
    'Goblet Squat':               'goblet-squat',
    'Dumbbell Tricep Kickback':   'dumbbell-tricep-kickback',
    'Dumbbell Pullover':          'dumbbell-pullover',
    'Dumbbell Step-Up':           'dumbbell-step-up',
    'Dumbbell Shrug':             'dumbbell-shrug',
    'Single-Arm Dumbbell Row':    'single-arm-dumbbell-row',
    'Kettlebell Swing':           'kettlebell-swing',
    'Kettlebell Goblet Squat':    'kettlebell-goblet-squat',
    'Kettlebell Turkish Get-Up':  'kettlebell-turkish-get-up',
    'Lat Pulldown (Wide Grip)':   'lat-pulldown-wide-grip',
    'Lat Pulldown (Close Grip)':  'lat-pulldown-close-grip',
    'Seated Cable Row':           'seated-cable-row',
    'Cable Tricep Pushdown':      'cable-tricep-pushdown',
    'Straight-Arm Pulldown':      'straight-arm-pulldown',
    'Cable Fly':                  'cable-fly',
    'Pull-Up':                    'pull-up',
    'Chin-Up':                    'chin-up',
    'Push-Up':                    'push-up',
    'Dip':                        'dip',
    'Inverted Row':               'inverted-row',
    'Dead Bug':                   'dead-bug',
    'Hanging Leg Raise':          'hanging-leg-raise',
    'Hanging Knee Raise':         'hanging-knee-raise',
    'Mountain Climbers':          'mountain-climbers',
    'Burpees':                    'burpees',
    'Box Jump':                   'box-jump',
    'Side Plank':                 'side-plank',
    'Face Pull':                  'face-pull',
  };

  const REMOTE_FALLBACK_BASE = 'https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises';
  const REMOTE_FALLBACK = {
    'Kettlebell Windmill': 'Advanced_Kettlebell_Windmill',
    'Ab Wheel Rollout':    'Ab_Roller',
    'Plank':               'Plank',
    'Bodyweight Squat':    'Bodyweight_Squat',
  };

  db.transaction(() => {
    for (const [name, slug] of Object.entries(LOCAL_GIFS)) {
      setGif.run(`/exercises/${slug}.gif`, name);
    }
    for (const [name, id] of Object.entries(REMOTE_FALLBACK)) {
      setGif.run(`${REMOTE_FALLBACK_BASE}/${id}/0.jpg`, name);
    }
  })();
}

// ─── Common ingredient seeds ──────────────────────────────────────────────────
// Only inserted if not already present (matched by name + brand).

const checkIngredient = db.prepare("SELECT id FROM foods WHERE name = ? AND brand = 'Common Ingredient'");
const insertIngredient = db.prepare(`
  INSERT INTO foods (name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g)
  VALUES (?, 'Common Ingredient', ?, ?, ?, ?, ?, ?, ?, ?)
`);

function ingredient(name, size, unit, cal, pro, carb, fat, fib = 0, sug = 0) {
  if (!checkIngredient.get(name)) {
    insertIngredient.run(name, size, unit, cal, pro, carb, fat, fib, sug);
  }
}

db.transaction(() => {
  // Oils & fats
  ingredient('Olive Oil',           100, 'g',   884,  0,    0,    100,  0,   0);
  ingredient('Vegetable Oil',       100, 'g',   884,  0,    0,    100,  0,   0);
  ingredient('Coconut Oil',         100, 'g',   862,  0,    0,    100,  0,   0);
  ingredient('Butter',              100, 'g',   717,  0.9,  0.1,  81,   0,   0.1);
  ingredient('Ghee',                100, 'g',   900,  0,    0,    100,  0,   0);
  // Flours & grains
  ingredient('All-Purpose Flour',   100, 'g',   364,  10,   76,   1,    2.7, 0.3);
  ingredient('Whole Wheat Flour',   100, 'g',   340,  13,   72,   2.5,  10,  0.4);
  ingredient('White Rice (raw)',    100, 'g',   365,  7,    79,   1,    1.3, 0);
  ingredient('White Rice (cooked)', 100, 'g',   130,  2.7,  28,   0.3,  0.4, 0);
  ingredient('Basmati Rice (raw)',  100, 'g',   349,  9,    78,   0.5,  0.6, 0);
  ingredient('Brown Rice (raw)',    100, 'g',   370,  8,    77,   3,    3.5, 0);
  ingredient('Oats',                100, 'g',   389,  17,   66,   7,    11,  1);
  ingredient('Breadcrumbs',         100, 'g',   395,  13,   73,   5,    3,   5);
  // Sweeteners
  ingredient('White Sugar',         100, 'g',   387,  0,    100,  0,    0,   100);
  ingredient('Brown Sugar',         100, 'g',   380,  0,    98,   0,    0,   97);
  ingredient('Honey',               100, 'g',   304,  0.3,  82,   0,    0.2, 82);
  // Dairy
  ingredient('Whole Milk',          100, 'ml',  61,   3.2,  4.8,  3.3,  0,   5);
  ingredient('Skim Milk',           100, 'ml',  34,   3.4,  5,    0.1,  0,   5);
  ingredient('Heavy Cream',         100, 'ml',  345,  2.1,  2.8,  36,   0,   2.9);
  ingredient('Greek Yogurt (plain)',100, 'g',   97,   9,    3.8,  5,    0,   3.2);
  ingredient('Cheddar Cheese',      100, 'g',   403,  25,   1.3,  33,   0,   0.5);
  ingredient('Parmesan Cheese',     100, 'g',   431,  38,   4,    29,   0,   0.9);
  // Eggs
  ingredient('Egg (whole)',         50,  'g',   78,   6,    0.6,  5,    0,   0.6);
  ingredient('Egg White',           33,  'g',   17,   3.6,  0.2,  0.1,  0,   0.2);
  ingredient('Egg Yolk',            17,  'g',   55,   2.7,  0.6,  4.5,  0,   0.1);
  // Proteins
  ingredient('Chicken Breast (raw)',  100, 'g', 120,  23,   0,    2.6,  0,   0);
  ingredient('Chicken Breast (cooked)',100,'g', 165,  31,   0,    3.6,  0,   0);
  ingredient('Chicken Thigh (raw)',   100, 'g', 177,  18,   0,    12,   0,   0);
  ingredient('Ground Beef 80/20',     100, 'g', 254,  17,   0,    20,   0,   0);
  ingredient('Ground Beef 93/7',      100, 'g', 152,  20,   0,    7.7,  0,   0);
  ingredient('Salmon (raw)',          100, 'g', 208,  20,   0,    13,   0,   0);
  ingredient('Tuna (canned in water)',100, 'g', 116,  26,   0,    1,    0,   0);
  ingredient('Paneer',               100, 'g',  265,  18,   3.6,  20,   0,   0);
  ingredient('Tofu (firm)',          100, 'g',   76,   8,    1.9,  4.8,  0.3, 0.3);
  // Legumes
  ingredient('Lentils (raw)',        100, 'g',  352,  25,   60,   1.1,  31,  2);
  ingredient('Chickpeas (cooked)',   100, 'g',  164,  8.9,  27,   2.6,  8,   4.8);
  ingredient('Black Beans (cooked)', 100, 'g',  132,  8.9,  24,   0.5,  8.7, 0.3);
  ingredient('Kidney Beans (cooked)',100, 'g',  127,  8.7,  23,   0.5,  6.4, 0.3);
  // Vegetables
  ingredient('Onion',               100, 'g',   40,   1.1,  9.3,  0.1,  1.7, 4.2);
  ingredient('Garlic',              100, 'g',  149,   6.4,  33,   0.5,  2.1, 1);
  ingredient('Tomato',              100, 'g',   18,   0.9,  3.9,  0.2,  1.2, 2.6);
  ingredient('Potato',              100, 'g',   77,   2,    17,   0.1,  2.2, 0.8);
  ingredient('Spinach',             100, 'g',   23,   2.9,  3.6,  0.4,  2.2, 0.4);
  ingredient('Broccoli',            100, 'g',   34,   2.8,  7,    0.4,  2.6, 1.7);
  ingredient('Carrot',              100, 'g',   41,   0.9,  10,   0.2,  2.8, 4.7);
  ingredient('Bell Pepper',         100, 'g',   31,   1,    6,    0.3,  2.1, 4.2);
  // Condiments & misc
  ingredient('Tomato Paste',        100, 'g',   82,   4.3,  19,   0.4,  4.1, 12);
  ingredient('Coconut Milk',        100, 'ml', 230,   2.3,  5.5,  24,   2.2, 3.4);
  ingredient('Soy Sauce',           100, 'ml',  53,   8.1,  4.9,  0.1,  0.1, 0.9);
  // Additional produce & nuts
  ingredient('Sweet Potato',        100, 'g',   86,   1.6,  20,   0.1,  3,   4.2);
  ingredient('Avocado',             150, 'g',  240,   3,    13,   22,   10,  1);
  ingredient('Banana',              120, 'g',  107,   1.3,  27,   0.4,  3.1, 14);
  ingredient('Strawberries',        100, 'g',   32,   0.7,  7.7,  0.3,  2,   4.9);
  ingredient('Blueberries',         100, 'g',   57,   0.7,  14,   0.3,  2.4, 10);
  ingredient('Almonds',              28, 'g',  164,   6,    6,    14,   3.5, 1.2);
  ingredient('Cashews',              28, 'g',  157,   5.2,  8.6,  12,   0.9, 1.7);
  ingredient('Walnuts',              28, 'g',  185,   4.3,  3.9,  18,   1.9, 0.7);
  ingredient('Pumpkin Seeds',        28, 'g',  151,   8.5,  5,    13,   1.7, 0.4);
  ingredient('Chia Seeds',           28, 'g',  138,   4.7,  12,   8.7,  9.8, 0);
  ingredient('Flaxseeds',            28, 'g',  152,   5.2,  8.2,  12,   7.7, 0.4);
  ingredient('Hemp Seeds',           30, 'g',  166,   9.5,  2.6,  14,   1.2, 0.4);
  ingredient('Sunflower Seeds',      28, 'g',  164,   5.5,  6.8,  14,   2.6, 0.8);
  ingredient('Peanut Butter',        32, 'g',  190,   8,    7,    16,   2,   3);
  ingredient('Almond Butter',        32, 'g',  196,   6.8,  6.1,  18,   3.3, 1.3);
  ingredient('Ezekiel Bread',        34, 'g',   80,   4,    15,   0.5,  3,   0);
  // Fresh fruits (per 100g, USDA FoodData Central)
  ingredient('Apple',              100, 'g',   52,   0.3,  13.8, 0.2,  2.4, 10.4);
  ingredient('Orange',             100, 'g',   47,   0.9,  11.8, 0.1,  2.4,  9.4);
  ingredient('Mango',              100, 'g',   60,   0.8,  15,   0.4,  1.6, 13.7);
  ingredient('Pineapple',          100, 'g',   50,   0.5,  13.1, 0.1,  1.4,  9.9);
  ingredient('Grapes',             100, 'g',   69,   0.7,  18,   0.2,  0.9, 15.5);
  ingredient('Watermelon',         100, 'g',   30,   0.6,   7.6, 0.2,  0.4,  6.2);
  ingredient('Peach',              100, 'g',   39,   0.9,   9.5, 0.3,  1.5,  8.4);
  ingredient('Pear',               100, 'g',   57,   0.4,  15.2, 0.1,  3.1,  9.8);
  ingredient('Kiwi',               100, 'g',   61,   1.1,  14.7, 0.5,  3,    8.9);
  ingredient('Cherries (sweet)',   100, 'g',   63,   1.1,  16,   0.2,  2.1, 12.8);
  ingredient('Raspberry',          100, 'g',   52,   1.2,  11.9, 0.7,  6.5,  4.4);
  ingredient('Grapefruit',         100, 'g',   42,   0.8,  10.7, 0.1,  1.6,  6.9);
  ingredient('Pomegranate Seeds',  100, 'g',   83,   1.7,  18.7, 1.2,  4,   13.7);
  ingredient('Cantaloupe',         100, 'g',   34,   0.8,   8.2, 0.2,  0.9,  7.9);
  ingredient('Lemon',              100, 'g',   29,   1.1,   9.3, 0.3,  2.8,  2.5);
  ingredient('Lime',               100, 'g',   30,   0.7,  10.5, 0.2,  2.8,  1.7);
  ingredient('Blackberries',       100, 'g',   43,   1.4,   9.6, 0.5,  5.3,  4.9);
  // Dried fruits (per 100g, USDA)
  ingredient('Medjool Dates (pitted)', 100, 'g', 277, 1.8, 75,  0.2,  6.7, 66.5);
  ingredient('Raisins',            100, 'g',  299,   3.1,  79,   0.5,  3.7, 59.2);
  ingredient('Dried Apricots',     100, 'g',  241,   3.4,  62.6, 0.5,  7.3, 53.4);
  ingredient('Dried Mango',        100, 'g',  319,   1.8,  78,   0.5,  2.4, 72);
  ingredient('Prunes (Dried Plums)',100, 'g', 240,   2.2,  63.9, 0.4,  7.1, 38.1);
  ingredient('Dried Cranberries',  100, 'g',  308,   0.2,  82,   1.4,  5.3, 72.6);
  ingredient('Dried Figs',         100, 'g',  249,   3.3,  63.9, 0.9,  9.8, 47.9);
  ingredient('Dried Blueberries',  100, 'g',  317,   3.4,  76.7, 2,    5.9, 66.8);
  // Spices (per 1 tsp)
  ingredient('Black Pepper',       2.5, 'g',    6,   0.2,  1.5,  0.1,  0.6, 0);
  ingredient('Garlic Powder',        3, 'g',    9,   0.5,  2,    0,    0.3, 0.2);
  ingredient('Onion Powder',       2.5, 'g',    8,   0.2,  1.9,  0,    0.1, 0.8);
  ingredient('Cumin',              2.5, 'g',    8,   0.4,  0.9,  0.5,  0.2, 0.1);
  ingredient('Paprika',            2.5, 'g',    6,   0.3,  1.2,  0.3,  0.5, 0.4);
  ingredient('Chili Powder',       2.5, 'g',    8,   0.4,  1.4,  0.4,  0.9, 0.2);
  ingredient('Turmeric',           2.5, 'g',    8,   0.2,  1.4,  0.2,  0.2, 0.1);
  ingredient('Cinnamon',           2.5, 'g',    6,   0.1,  1.9,  0.1,  1.2, 0.1);
  ingredient('Oregano',              1, 'g',    3,   0.1,  0.7,  0.1,  0.5, 0);
  ingredient('Red Pepper Flakes',    2, 'g',    6,   0.3,  1,    0.3,  0.5, 0.6);
  ingredient('Coriander',          2.5, 'g',    5,   0.2,  1,    0.3,  0.8, 0);
  ingredient('Garam Masala',       2.5, 'g',    8,   0.3,  1.5,  0.4,  0.6, 0);
})();

// ─── Branded food seeds ───────────────────────────────────────────────────────
// Idempotent: only inserted if (name, brand) pair doesn't already exist.

const checkBranded = db.prepare('SELECT id FROM foods WHERE name = ? AND brand = ?');
const insertBranded = db.prepare(`
  INSERT INTO foods (name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

function branded(name, brand, size, unit, cal, pro, carb, fat, fib = 0, sug = 0) {
  if (!checkBranded.get(name, brand)) {
    insertBranded.run(name, brand, size, unit, cal, pro, carb, fat, fib, sug);
  }
}

db.transaction(() => {

  // ── Chobani Complete (20g protein line) — 170g container ─────────────────
  branded('Complete Greek Yogurt - Plain',         'Chobani', 170, 'g', 130, 20, 11, 2.5, 0,   6);
  branded('Complete Greek Yogurt - Strawberry',    'Chobani', 170, 'g', 140, 20, 14, 2.5, 0,  10);
  branded('Complete Greek Yogurt - Mixed Berry',   'Chobani', 170, 'g', 140, 20, 14, 2.5, 0,  10);
  branded('Complete Greek Yogurt - Peach',         'Chobani', 170, 'g', 140, 20, 14, 2.5, 0,  10);
  branded('Complete Greek Yogurt - Blueberry',     'Chobani', 170, 'g', 140, 20, 14, 2.5, 0,  10);
  branded('Complete Greek Yogurt - Mango',         'Chobani', 170, 'g', 140, 20, 14, 2.5, 0,  10);
  branded('Complete Greek Yogurt - Vanilla',       'Chobani', 170, 'g', 130, 20, 12, 2.5, 0,   8);
  branded('Complete Greek Yogurt - Raspberry',     'Chobani', 170, 'g', 140, 20, 14, 2.5, 0,  10);

  // ── Chobani Greek Yogurt regular (11-13g protein) — 150g container ───────
  branded('Greek Yogurt - Plain 2%',               'Chobani', 150, 'g', 120, 12, 11, 3,   0,   9);
  branded('Greek Yogurt - Plain Nonfat',           'Chobani', 150, 'g',  90, 15,  6, 0,   0,   5);
  branded('Greek Yogurt - Strawberry',             'Chobani', 150, 'g', 130, 11, 19, 3,   0,  15);
  branded('Greek Yogurt - Blueberry',              'Chobani', 150, 'g', 130, 11, 19, 3,   0,  15);
  branded('Greek Yogurt - Raspberry',              'Chobani', 150, 'g', 130, 11, 19, 3,   0,  15);
  branded('Greek Yogurt - Peach',                  'Chobani', 150, 'g', 130, 11, 19, 3,   0,  15);
  branded('Greek Yogurt - Mango',                  'Chobani', 150, 'g', 130, 11, 20, 3,   0,  16);
  branded('Greek Yogurt - Mixed Berry',            'Chobani', 150, 'g', 130, 11, 19, 3,   0,  15);
  branded('Greek Yogurt - Cherry',                 'Chobani', 150, 'g', 130, 11, 19, 3,   0,  15);
  branded('Greek Yogurt - Pineapple',              'Chobani', 150, 'g', 130, 11, 20, 3,   0,  16);
  branded('Greek Yogurt - Honey',                  'Chobani', 150, 'g', 140, 12, 19, 3,   0,  16);
  branded('Greek Yogurt - Vanilla',                'Chobani', 150, 'g', 130, 11, 17, 3,   0,  14);

  // ── Daisy Cottage Cheese ──────────────────────────────────────────────────
  branded('Cottage Cheese 2% Low Fat',             'Daisy',   113, 'g',  90, 13,  5, 2.5, 0,   4);
  branded('Cottage Cheese 4% Milkfat',             'Daisy',   113, 'g', 110, 13,  4, 5,   0,   3);
  branded('Cottage Cheese 2% Low Fat Large Curd',  'Daisy',   113, 'g',  90, 13,  5, 2.5, 0,   4);
  branded('Cottage Cheese 1% Low Fat',             'Daisy',   113, 'g',  80, 14,  5, 1,   0,   4);
  branded('Cottage Cheese 0% Nonfat',              'Daisy',   113, 'g',  80, 14,  6, 0,   0,   5);
  // Single-serve 5.3oz cup line — higher protein per serving than the multi-serve tub above
  branded('Cottage Cheese 4% Milkfat (Single-Serve Cup)', 'Daisy', 150, 'g', 150, 17, 7, 6, 0, 4);
  branded('Cottage Cheese 2% Low Fat (Single-Serve Cup)', 'Daisy', 150, 'g', 120, 17, 6, 3, 0, 5);

  // ── Fairlife Nutrition Plan Protein Shake — 325ml bottle ─────────────────
  branded('Nutrition Plan Shake - Chocolate',      'Fairlife', 325, 'ml', 150, 30,  4, 2.5, 0,  2);
  branded('Nutrition Plan Shake - Vanilla',        'Fairlife', 325, 'ml', 150, 30,  4, 2.5, 0,  2);
  branded('Nutrition Plan Shake - Strawberry',     'Fairlife', 325, 'ml', 150, 30,  4, 2.5, 0,  2);
  branded('Nutrition Plan Shake - Chocolate PB',   'Fairlife', 325, 'ml', 160, 30,  5, 4,   0,  2);
  branded('Core Power Elite 42g Chocolate',        'Fairlife', 414, 'ml', 230, 42,  7, 5,   0,  4);
  branded('Core Power Elite 42g Vanilla',          'Fairlife', 414, 'ml', 230, 42,  7, 5,   0,  4);

  // ── Optimum Nutrition Gold Standard Whey — 31g per scoop ─────────────────
  branded('Gold Standard Whey - Double Chocolate', 'Optimum Nutrition', 31, 'g', 120, 24, 3, 1.5, 1, 1);
  branded('Gold Standard Whey - Vanilla Ice Cream','Optimum Nutrition', 31, 'g', 120, 24, 3, 1,   0, 2);
  branded('Gold Standard Whey - Chocolate Mint',   'Optimum Nutrition', 31, 'g', 120, 24, 4, 1,   0, 1);
  branded('Gold Standard Whey - Birthday Cake',    'Optimum Nutrition', 31, 'g', 120, 24, 4, 1,   0, 2);
  branded('Gold Standard Whey - Strawberry',       'Optimum Nutrition', 31, 'g', 120, 24, 4, 1,   0, 2);
  branded('Gold Standard Whey - Choc Peanut Butter','Optimum Nutrition',31, 'g', 130, 24, 5, 2,   0, 2);
  branded('Gold Standard Whey - Mocha Cappuccino', 'Optimum Nutrition', 31, 'g', 120, 24, 3, 1,   0, 1);
  branded('Gold Standard Whey - Banana Cream',     'Optimum Nutrition', 31, 'g', 120, 24, 4, 1,   0, 2);

  // ── Garofalo Pasta — 85g dry serving ─────────────────────────────────────
  branded('Spaghetti',                             'Garofalo',  85, 'g', 310, 11, 63, 1.5, 2, 2);
  branded('Penne Rigate',                          'Garofalo',  85, 'g', 310, 11, 63, 1.5, 2, 2);
  branded('Rigatoni',                              'Garofalo',  85, 'g', 310, 11, 63, 1.5, 2, 2);
  branded('Fusilli',                               'Garofalo',  85, 'g', 310, 11, 63, 1.5, 2, 2);
  branded('Linguine',                              'Garofalo',  85, 'g', 310, 11, 63, 1.5, 2, 2);
  branded('Farfalle',                              'Garofalo',  85, 'g', 310, 11, 63, 1.5, 2, 2);
  branded('Spaghetti Integrali (Whole Wheat)',     'Garofalo',  85, 'g', 300, 13, 58, 2,   6, 1);
  branded('Penne Integrali (Whole Wheat)',         'Garofalo',  85, 'g', 300, 13, 58, 2,   6, 1);

  // ── Quaker Oats ───────────────────────────────────────────────────────────
  branded('Old Fashioned Oats',                    'Quaker',    40, 'g', 150,  5, 27, 3,   4, 1);
  branded('Quick 1-Minute Oats',                   'Quaker',    40, 'g', 150,  5, 27, 3,   4, 1);
  branded('Steel Cut Oats',                        'Quaker',    40, 'g', 150,  5, 27, 2.5, 4, 0);
  branded('Instant Oatmeal - Original',            'Quaker',    28, 'g', 100,  3, 19, 2,   3, 0);
  branded('Instant Oatmeal - Maple & Brown Sugar', 'Quaker',    43, 'g', 160,  4, 33, 2,   3,12);
  branded('Instant Oatmeal - Apple Cinnamon',      'Quaker',    43, 'g', 160,  4, 33, 2,   3,12);
  branded('Instant Oatmeal - Cinnamon & Spice',    'Quaker',    46, 'g', 170,  4, 36, 2,   3,14);
  branded('Instant Oatmeal - Honey & Almond',      'Quaker',    43, 'g', 160,  4, 32, 3,   3,12);
  branded('High Protein Oats',                     'Quaker',    50, 'g', 190,  8, 32, 4,   5, 1);

  // ── Oat Milk brands — 240ml per cup ──────────────────────────────────────
  branded('Oat Milk Original',                     'Oatly',    240, 'ml', 120, 3, 16, 5, 2, 7);
  branded('Oat Milk Full Fat',                     'Oatly',    240, 'ml', 160, 3, 18, 8, 2, 7);
  branded('Oat Milk Low Fat',                      'Oatly',    240, 'ml',  90, 3, 16, 1.5,2, 7);
  branded('Oat Barista Edition',                   'Oatly',    240, 'ml', 130, 3, 17, 5, 2, 8);
  branded('Oat Milk Original',                     'Califia Farms', 240, 'ml',  90, 1, 15, 2.5, 1, 7);
  branded('Oat Milk Barista Blend',                'Califia Farms', 240, 'ml', 130, 1, 18, 5, 1, 9);
  branded('Oat Milk Unsweetened',                  'Califia Farms', 240, 'ml',  45, 1, 9,  1,  1, 0);
  branded('Oat Milk Original',                     'Planet Oat',240, 'ml',  90, 2, 17, 2, 2, 8);
  branded('Oat Milk Extra Creamy',                 'Planet Oat',240, 'ml', 130, 3, 22, 4, 2, 9);
  branded('Oat Milk Original',                     'Silk',     240, 'ml',  90, 2, 16, 2, 2, 8);
  branded('Oat Milk Unsweet',                      'Silk',     240, 'ml',  45, 1,  8, 1, 1, 0);
  branded('Oat Milk Original',                     'Chobani',  240, 'ml', 120, 3, 19, 4, 2, 7);

  // ── Trader Joe's Honey ────────────────────────────────────────────────────
  branded('Multifloral Honey',                     'Trader Joe\'s', 21, 'g', 60, 0, 17, 0, 0, 16);
  branded('Organic Raw Honey',                     'Trader Joe\'s', 21, 'g', 60, 0, 17, 0, 0, 16);
  branded('Manuka Honey',                          'Trader Joe\'s', 21, 'g', 60, 0, 17, 0, 0, 16);

  // ── Trader Joe's Sauces & Condiments ─────────────────────────────────────
  branded('Tikka Masala Simmer Sauce',             'Trader Joe\'s',  62, 'g',  90, 2,  9, 5, 0, 5);
  branded('Mango Chili Sauce',                     'Trader Joe\'s',  15, 'g',  30, 0,  7, 0, 0, 6);
  branded('Enchilada Sauce Red',                   'Trader Joe\'s',  60, 'g',  25, 1,  4, 1, 1, 2);
  branded('Chili Onion Crunch',                    'Trader Joe\'s',  16, 'g',  70, 1,  3, 7, 0, 1);
  branded('Soyaki Sauce',                          'Trader Joe\'s',  32, 'g',  70, 1, 16, 0, 0,14);
  branded('Peri Peri Sauce',                       'Trader Joe\'s',  30, 'g',  35, 0,  7, 1, 0, 5);
  branded('Green Dragon Hot Sauce',                'Trader Joe\'s',   5, 'g',   5, 0,  1, 0, 0, 0);
  branded('Sriracha',                              'Trader Joe\'s',   5, 'g',   5, 0,  1, 0, 0, 0);
  branded('Thai Green Curry Sauce',                'Trader Joe\'s',  62, 'g', 100, 2,  6, 8, 1, 3);
  branded('Korean Inspired BBQ Sauce',             'Trader Joe\'s',  32, 'g',  50, 1, 11, 0, 0, 9);
  branded('Arrabiata Sauce',                       'Trader Joe\'s', 125, 'g',  80, 2, 11, 3, 2, 7);
  branded('Tomato Basil Marinara Sauce',           'Trader Joe\'s', 125, 'g',  70, 2, 11, 2, 2, 7);

  // ── Common condiments ─────────────────────────────────────────────────────
  branded('Ketchup',                               'Heinz',     15, 'g',  20, 0,  5, 0, 0, 4);
  branded('Yellow Mustard',                        "French's",   5, 'g',   3, 0.2,0.3,0.1,0, 0);
  branded('Real Mayonnaise',                       "Hellmann's",13, 'g',  90, 0,  1,10, 0, 0);
  branded('Light Mayonnaise',                      "Hellmann's",15, 'g',  35, 0,  2, 3, 0, 1);
  branded('RedHot Original Hot Sauce',             "Frank's",    5,'ml',   0, 0,  0, 0, 0, 0);
  branded('Sriracha Chili Sauce',                  'Huy Fong',   5, 'g',   5, 0,  1, 0, 0, 1);
  branded('Organic Apple Cider Vinegar',           'Bragg',     15,'ml',   3, 0,  0.1,0,0, 0);
  branded('Coconut Aminos',                        'Bragg',     16,'ml',  20, 0,  4, 0, 0, 4);
  branded('Liquid Aminos',                         'Bragg',      5,'ml',   5, 0.5,0, 0, 0, 0);

  // ── Peanut & almond butter (branded) ────────────────────────────────────
  branded('Creamy Peanut Butter',                  'Jif',       32, 'g', 190, 7,  8,16, 2, 3);
  branded('Natural Creamy Peanut Butter',          'Jif',       32, 'g', 190, 8,  7,16, 2, 2);
  branded('Natural Creamy Peanut Butter',          'Skippy',    32, 'g', 190, 7,  7,17, 2, 3);
  branded('Creamy Almond Butter',                  'Justin\'s', 32, 'g', 200, 6,  6,18, 3, 2);
  branded('Almond Butter',                         'Trader Joe\'s',32,'g',190, 7,  6,17, 3, 3);
  branded('Sunflower Seed Butter',                 'SunButter', 32, 'g', 200, 7,  7,17, 3, 3);

  // ── Protein bars ──────────────────────────────────────────────────────────
  branded('Chocolate Sea Salt Bar',                'RXBAR',     52, 'g', 210,12, 23, 9, 5,13);
  branded('Blueberry Bar',                         'RXBAR',     52, 'g', 210,12, 24, 9, 4,13);
  branded('Chocolate Chip Bar',                    'RXBAR',     52, 'g', 210,12, 23, 9, 4,13);
  branded('Peanut Butter Bar',                     'RXBAR',     52, 'g', 220,12, 22,11, 4,12);
  branded('Dark Choc Nuts & Sea Salt',             'Kind',      40, 'g', 200, 6, 16,15, 7, 5);
  branded('Almond & Coconut Bar',                  'Kind',      40, 'g', 210, 4, 19,14, 5, 9);
  branded('Chocolate Chip Cookie Dough Bar',       'Quest',     60, 'g', 190,21, 26, 8,14, 1);
  branded('Chocolate Brownie Bar',                 'Quest',     60, 'g', 180,21, 25, 8,13, 1);
  branded('Birthday Cake Bar',                     'Quest',     60, 'g', 190,21, 27, 8,14, 1);
  branded('Peanut Butter Crunch Bar',              'Quest',     60, 'g', 200,21, 25, 9,14, 1);

  // ── Bread ─────────────────────────────────────────────────────────────────
  branded('21 Whole Grains & Seeds Bread',         "Dave's Killer Bread", 45,'g',130, 5,24,1.5,5,5);
  branded('Thin-Sliced 21 Whole Grains',           "Dave's Killer Bread", 28,'g', 70, 3,14,0.5,3,3);
  branded('Sprouted Whole Wheat Bread',            'Ezekiel',   34, 'g',  80, 4, 15, 0.5,3, 0);
  branded('Low Carb Flour Tortilla',               'Mission',   42, 'g', 100, 4, 19, 3, 11, 1);
  branded('Almond Flour Tortilla',                 'Siete',     30, 'g',  90, 2, 13, 4,  3, 0);
  branded('Cassava Flour Tortilla',                'Siete',     39, 'g', 110, 1, 24, 1,  1, 0);

  // ── Fage Greek Yogurt ─────────────────────────────────────────────────────
  branded('Total 0% Plain Greek Yogurt',           'Fage',     170, 'g',  90,18,  6, 0, 0, 6);
  branded('Total 2% Plain Greek Yogurt',           'Fage',     170, 'g', 130,17,  8, 4, 0, 6);
  branded('Total 5% Plain Greek Yogurt',           'Fage',     170, 'g', 170,16,  7, 9, 0, 6);
  branded('Total 0% with Strawberry',              'Fage',     150, 'g', 130,12, 22, 0, 0,18);
  branded('Total 0% with Honey',                   'Fage',     150, 'g', 170,12, 31, 0, 0,28);

  // ── Cottage cheese (other brands) ────────────────────────────────────────
  branded('2% Milkfat Cottage Cheese',             'Good Culture', 113,'g', 90,14,  4, 2.5,0, 4);
  branded('Whole Milk Cottage Cheese',             'Good Culture', 113,'g',120,13,  4, 6,  0, 4);
  branded('1% Lowfat Cottage Cheese',              "Breakstone's",113,'g', 80,13,  6, 1,  0, 4);
  branded('4% Milkfat Cottage Cheese',             "Breakstone's",113,'g',120,12,  4, 6,  0, 3);

  // ── Protein powder (other brands) ────────────────────────────────────────
  branded('Vanilla Whey Protein',                  'Ghost',      35,'g', 130,25,  5, 2, 0, 3);
  branded('Peanut Butter Cereal Milk Whey',        'Ghost',      35,'g', 140,25,  5, 3, 0, 3);
  branded('Grass-Fed Whey - Chocolate',            'Orgain',     46,'g', 150,21, 15, 4, 2, 6);
  branded('Isolate Protein - Vanilla',             'Dymatize',   31,'g', 120,25,  2, 1, 0, 0);

  // ── Canned goods / pantry ─────────────────────────────────────────────────
  branded('Fire Roasted Diced Tomatoes',           'Muir Glen',  130,'g',  30, 1,  6, 0, 1, 3);
  branded('Organic Crushed Tomatoes',              'Muir Glen',  130,'g',  30, 1,  7, 0, 2, 5);
  branded('Chickpeas (Garbanzo Beans)',            'Eden Foods', 130,'g', 110, 6, 18, 2, 5, 2);
  branded('Organic Black Beans',                   'Eden Foods', 130,'g', 110, 7, 18, 1, 7, 1);
  branded('Coconut Cream',                         'Thai Kitchen', 60,'g', 110, 1,  2,12, 0, 1);
  branded('Light Coconut Milk',                    'Thai Kitchen',120,'ml', 45, 0,  5, 3, 0, 1);

  // ── String cheese & snack cheese ─────────────────────────────────────────
  branded('Part-Skim String Cheese',               'Sargento',  24, 'g',  60, 7,  0, 3.5,0, 0);
  branded('Natural String Cheese',                 'Kraft',     24, 'g',  60, 6,  1, 4,  0, 0);
  branded('Mini Babybel Light',                    'Babybel',   19, 'g',  42, 5,  0, 2.5,0, 0);
  branded('Mini Babybel Original',                 'Babybel',   21, 'g',  70, 5,  0, 5,  0, 0);

  // ── Eggs (branded) ────────────────────────────────────────────────────────
  branded('Liquid Egg Whites',                     'Egg Beaters',   61,'g', 25, 5, 0.5, 0, 0, 0);
  branded('All Natural Cage Free Large Egg',       'Vital Farms',   50,'g', 70, 6,  0,  5, 0, 0);

  // ── Ghee (branded) ────────────────────────────────────────────────────────
  branded('Grassfed Pure Ghee',                    'Fourth & Heart', 14,'g',120, 0, 0, 14, 0, 0);
  branded('Organic Ghee',                          'Ancient Organics',14,'g',120,0, 0, 14, 0, 0);
  branded('Grass-Fed Ghee',                        'Organic Valley', 14,'g',120, 0, 0, 14, 0, 0);

  // ── Oils (branded) ────────────────────────────────────────────────────────
  branded('Extra Virgin Olive Oil',                'California Olive Ranch',14,'g',120,0,0,14,0,0);
  branded('Avocado Oil',                           'Chosen Foods',  14,'g',120, 0, 0, 14, 0, 0);
  branded('Coconut Oil',                           'Nutiva',        14,'g',120, 0, 0, 14, 0, 0);

  // ── Dates & dried fruits (branded) ──────────────────────────────────────
  branded('Medjool Dates',                         'Bard Valley',   24, 'g',  67, 0.4,18, 0,  1.6,15.9);
  branded('Natural Delights Medjool Dates',        'Natural Delights',24,'g', 67, 0.4,18, 0,  1.6,15.9);
  branded('California Sun Dried Raisins',          'Sun-Maid',      40, 'g', 130, 1, 31, 0,  1,  28);
  branded('Organic Raisins',                       'Trader Joe\'s', 40, 'g', 130, 1, 31, 0,  1,  28);
  branded('Dried Mango Slices',                    'Trader Joe\'s', 40, 'g', 130, 0.7,32, 0.2,1, 29);
  branded('Dried Blueberries',                     'Trader Joe\'s', 30, 'g',  95, 1, 23, 0.6,1.8,20);
  branded('Fancy Medjool Dates',                   'Trader Joe\'s', 24, 'g',  67, 0.4,18, 0,  1.6,15.9);
  branded('Dried Tart Cherries',                   'Trader Joe\'s', 40, 'g', 140, 0, 35, 0,  1,  30);
  branded('Unsweetened Dried Mango',               'Made in Nature', 40,'g', 130, 1, 32, 0.5,2,  27);
  // ── Rice & grains ─────────────────────────────────────────────────────────
  branded('Brown Rice',                            'Lundberg',      45,'g', 160, 3, 35, 1.5,2, 0);
  branded('White Jasmine Rice',                    'Lundberg',      45,'g', 160, 3, 36, 0, 0, 0);
  branded('Organic Brown Rice',                    'Trader Joe\'s', 45,'g', 150, 3, 34, 1.5,2, 0);

  // ── Edamame & legumes ────────────────────────────────────────────────────
  branded('Shelled Edamame',                       'Trader Joe\'s',100,'g', 120, 12, 9,  5, 5, 2);
  branded('Green Peas (Frozen)',                   'Birds Eye',    100,'g',  80,  5,14, 0, 5, 5);

  // ── Cereal & granola ──────────────────────────────────────────────────────
  branded('Granola - Cinnamon',                    'Kind',           52,'g', 230, 5,30,10, 4,10);
  branded('Original Granola',                      'Bear Naked',     55,'g', 260, 5,38,10, 4,11);
  branded('Protein Granola Dark Chocolate',        'Purely Elizabeth',55,'g',230, 8,36, 7, 5,11);

})();

  // ── Lazy Dog sides ───────────────────────────────────────────────────────────
  // Each item has two entries: "full order" (shareable appetizer/standalone) and
  // "side" (the smaller portion that comes as the burger add-on / substitute).
  // Cajun Fries side (630 kcal) confirmed via fatsecret.com.
  // Onion Rings full order (850 kcal) confirmed via eatthismuch.com.
  // Sweet Potato Tots full order (720 kcal) confirmed via eatthismuch.com.
  // Side portions estimated at ~60% of full order (matching French Fries 490 vs Cajun 630 ratio).
  branded('Onion Rings - Full Order',            'Lazy Dog', 1, 'serving', 850,  7, 74, 60,  4, 7);
  branded('Onion Rings - Side',                  'Lazy Dog', 1, 'serving', 510,  4, 44, 36,  2, 4);
  branded('Lemon Pepper Tater Tots - Full Order','Lazy Dog', 1, 'serving', 680,  7, 68, 43,  5, 3);
  branded('Lemon Pepper Tater Tots - Side',      'Lazy Dog', 1, 'serving', 410,  4, 41, 26,  3, 2);
  branded('Truffle Fries - Full Order',          'Lazy Dog', 1, 'serving', 760,  9, 78, 47,  5, 2);
  branded('Truffle Fries - Side',                'Lazy Dog', 1, 'serving', 460,  5, 47, 28,  3, 1);

  // ── Dish N' Dash — protein portions (log plate sides separately below) ───────
  // Plates include protein + 2 sides (choice: rice/freekeh + hummus/salad/veggies).
  // Protein estimates based on typical 6–7oz grilled portions with sauce.
  branded('Chicken Shawarma',   "Dish N' Dash", 1, 'serving', 390, 44, 16, 17, 1, 1);
  branded('Grilled Salmon',     "Dish N' Dash", 1, 'serving', 420, 46,  5, 24, 0, 0);
  branded('Kufta Kebob',        "Dish N' Dash", 1, 'serving', 410, 32, 12, 28, 1, 1);
  // Dish N' Dash plate sides — portion sizes that come included with a plate.
  // Smaller than ordering each as a standalone dish.
  branded('Aged Basmati Rice',          "Dish N' Dash", 1, 'serving', 230,  5, 48,  3, 1, 0);
  branded('Freekeh',                    "Dish N' Dash", 1, 'serving', 210,  8, 38,  3, 5, 0);
  branded('Hummus',                     "Dish N' Dash", 1, 'serving', 110,  4,  9,  7, 2, 1);
  branded('Falafel (3 pc)',             "Dish N' Dash", 1, 'serving', 175,  6, 18, 10, 3, 1);
  branded('Tabouli',                    "Dish N' Dash", 1, 'serving',  95,  2, 11,  5, 2, 2);
  branded('Fattoush Salad',             "Dish N' Dash", 1, 'serving', 120,  2, 14,  6, 2, 4);
  branded('Edamame Corn Salsa',         "Dish N' Dash", 1, 'serving',  80,  4, 10,  3, 2, 3);
  branded('Grilled Veggies',            "Dish N' Dash", 1, 'serving',  85,  3, 12,  4, 3, 6);
  branded('Babaghanouge',               "Dish N' Dash", 1, 'serving', 105,  2,  8,  8, 2, 4);
  branded('Garlic Dip',                 "Dish N' Dash", 1, 'serving',  60,  1,  3,  5, 0, 1);

  // ── Common restaurant sides (generic, works across cuisines) ─────────────────
  // "Side" = small portion accompanying an entree; not a standalone full plate.
  branded('Rice Side',           'Restaurant',  1, 'serving', 200,  4, 42,  2, 0, 0);
  branded('Hummus Side',         'Restaurant',  1, 'serving', 130,  5, 12,  8, 2, 1);
  branded('Falafel Side (3 pc)', 'Restaurant',  1, 'serving', 175,  6, 18, 10, 3, 1);

  // ── Indian restaurant mains — brand: Restaurant ──────────────────────────────
  // Curry servings ~300g (no rice). Biryani = full plate.
  // Sources: myfitnesspal aggregates, nutritionix restaurant avg, FreshMenu nutrition blog.
  branded('Chicken Tikka Masala', 'Restaurant', 1, 'serving', 450, 38, 18, 24, 2, 6);
  branded('Butter Chicken',       'Restaurant', 1, 'serving', 460, 35, 16, 28, 1, 7);
  branded('Gobi Manchurian',      'Restaurant', 1, 'serving', 340,  7, 42, 16, 3, 8);
  branded('Chicken Biryani',      'Restaurant', 1, 'serving', 680, 44, 78, 20, 3, 2);
  branded('Jeera Rice',           'Restaurant', 1, 'serving', 310,  6, 58,  7, 1, 0);
  branded('Dal Makhani',          'Restaurant', 1, 'serving', 320, 12, 36, 14, 8, 2);
  branded('Garlic Naan',          'Restaurant', 1, 'serving', 220,  7, 38,  5, 2, 2);
  branded('Plain Naan',           'Restaurant', 1, 'serving', 190,  6, 36,  3, 1, 1);
  branded('Tandoori Roti',        'Restaurant', 1, 'serving', 120,  4, 24,  1, 2, 1);

  // ── Everest Cuisine — unique items ───────────────────────────────────────────
  // Tandoori Chicken Momos: chicken-filled Nepali dumplings, tandoori-spiced (~8 pc)
  branded('Tandoori Chicken Momos', 'Everest Cuisine', 1, 'serving', 370, 24, 38, 14, 2, 3);

  // ── Himalayan Kitchen — unique items ─────────────────────────────────────────
  // Vijayawada Chicken Biryani: Andhra/Telugu-style, spicier, more masala, large portion
  branded('Vijayawada Chicken Biryani', 'Himalayan Kitchen', 1, 'serving', 760, 47, 84, 25, 3, 3);

  // ── Brundavan — unique items ─────────────────────────────────────────────────
  // Boneless Chicken Biryani: all boneless, similar macro profile to generic biryani
  branded('Boneless Chicken Biryani', 'Brundavan', 1, 'serving', 700, 48, 76, 22, 3, 2);

// ─── Accuracy corrections ────────────────────────────────────────────────────
// These UPDATE statements fix incorrect values already in the DB.

// Chicken Thigh (raw): original values were incorrect; corrected to boneless
// skinless per USDA FDC #331960.
db.prepare(`
  UPDATE foods SET calories=119, protein_g=19.3, fat_g=4.5, updated_at=datetime('now','localtime')
  WHERE name='Chicken Thigh (raw)' AND brand='Common Ingredient'
`).run();

// Cajun Fries: macros in the original entry didn't add up to the stated 630 kcal.
// Corrected to fatsecret-sourced values: 7P / 66C / 37F @ 630 kcal.
db.prepare(`
  UPDATE foods SET protein_g=7, carbs_g=66, fat_g=37, updated_at=datetime('now','localtime')
  WHERE name='(Lazy Dog) Cajun Fries' AND brand='Lazy Dog'
`).run();

// Hummus Side (Restaurant): was 190 kcal — too large (full plate, not a side ramekin).
// A small ramekin portion served alongside an entree is ~80g = ~130 kcal.
db.prepare(`
  UPDATE foods SET calories=130, protein_g=5, carbs_g=12, fat_g=8, fiber_g=2,
    updated_at=datetime('now','localtime')
  WHERE name='Hummus Side' AND brand='Restaurant'
`).run();

// Falafel Side: rename from (4 pc) to (3 pc) and adjust macros to match 3-piece side.
db.prepare(`
  UPDATE foods SET name='Falafel Side (3 pc)', calories=175, protein_g=6, carbs_g=18,
    fat_g=10, fiber_g=3, updated_at=datetime('now','localtime')
  WHERE name='Falafel Side (4 pc)' AND brand='Restaurant'
`).run();

// Lazy Dog duplicate cleanup: the original single-entry items are superseded by
// the Full Order / Side split added later. Rename to "(old)" so they don't clutter
// search results but are preserved in case any meal_items reference them.
[
  ['Lemon Pepper Tater Tots', 'Lazy Dog'],
  ['Truffle Fries', 'Lazy Dog'],
  ['Onion Rings with Bark & Bite Sauce', 'Lazy Dog'],
].forEach(([name, brand]) => {
  const exists = db.prepare('SELECT id FROM foods WHERE name=? AND brand=?').get(name + ' (legacy)', brand);
  if (!exists) {
    db.prepare(`UPDATE foods SET name=name||' (legacy)' WHERE name=? AND brand=?`).run(name, brand);
  }
});

// Add bone-in skin-on thigh as a separate ingredient if not present.
if (!checkIngredient.get('Chicken Thigh Bone-In Skin-On (raw)')) {
  insertIngredient.run('Chicken Thigh Bone-In Skin-On (raw)', 100, 'g', 186, 18.5, 0, 14.4, 0, 0);
}

module.exports = db;
