/**
 * Adds missing basic exercises + downloads their GIFs.
 * Run: node server/scripts/add-missing-exercises.js
 */

const path   = require('path');
const fs     = require('fs');
const https  = require('https');
const Database = require('better-sqlite3');

const DB_PATH  = path.join(__dirname, '../../data/fitness.db');
const GIF_DIR  = path.join(__dirname, '../../client/public/exercises');
const GIF_BASE = 'https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/';

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const EXERCISES = [
  {
    name: 'Russian Twist',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["core","obliques"]',
    secondary_muscles: '[]',
    met_value: 4.0,
    gif_remote: 'videos/0687-XVDdcoj.gif',
    gif_slug: 'russian-twist',
    description: 'Sit on floor, knees bent, feet raised or anchored. Lean back to ~45°, spine neutral. Hold a weight at chest height. Rotate your torso to touch or reach the floor on each side, leading with your shoulders — not just your arms. 10–15 reps per side.',
  },
  {
    name: 'Crunch',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["core"]',
    secondary_muscles: '[]',
    met_value: 3.0,
    gif_remote: 'videos/0274-TFqbd8t.gif',
    gif_slug: 'crunch',
    description: 'Lie on your back, knees bent, feet flat. Place hands lightly behind your head — don\'t pull. Curl only your upper back off the floor by contracting your abs. Hold briefly at the top. Keep your lower back pressed into the floor throughout.',
  },
  {
    name: 'Reverse Crunch',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["core"]',
    secondary_muscles: '["hip_flexors"]',
    met_value: 3.5,
    gif_remote: 'videos/0872-nCU1Ekp.gif',
    gif_slug: 'reverse-crunch',
    description: 'Lie flat, hands at your sides or under your lower back. Bring knees to chest, then curl your pelvis upward — lifting hips off the floor by contracting the lower abs. The movement is small and controlled; lower slowly without letting momentum take over.',
  },
  {
    name: 'Flutter Kicks',
    category: 'strength',
    exercise_type: 'timed',
    primary_muscles: '["core","hip_flexors"]',
    secondary_muscles: '[]',
    met_value: 4.0,
    gif_remote: 'videos/0459-UVo2Qs2.gif',
    gif_slug: 'flutter-kicks',
    description: 'Lie flat on your back, arms at sides. Press your lower back into the floor and lift both legs 6–12 inches. Alternately kick legs up and down in small, rapid pulses — legs straight throughout. Maintain tension; don\'t let the lower back arch.',
  },
  {
    name: 'Skull Crusher',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["triceps"]',
    secondary_muscles: '[]',
    met_value: 4.0,
    gif_remote: 'videos/0060-h8LFzo9.gif',
    gif_slug: 'skull-crusher',
    description: 'Lie on a bench, barbell or EZ bar held above chest with arms straight. Keeping upper arms vertical and stationary, hinge at the elbows and lower the bar toward your forehead or just past it. Press back to full extension. Keep elbows from flaring.',
  },
  {
    name: 'Leg Extension',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["quads"]',
    secondary_muscles: '[]',
    met_value: 3.5,
    gif_remote: 'videos/0585-my33uHU.gif',
    gif_slug: 'leg-extension',
    description: 'Sit in the machine, the pad resting on your lower shins just above the ankles. Extend both legs until straight, squeezing the quads at the top. Lower slowly — 2–3 seconds on the descent. Avoid swinging; this is a pure quad isolation.',
  },
  {
    name: 'Seated Leg Curl',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["hamstrings"]',
    secondary_muscles: '["calves"]',
    met_value: 3.5,
    gif_remote: 'videos/0599-Zg3XY7P.gif',
    gif_slug: 'seated-leg-curl',
    description: 'Sit in the machine with the pad resting on your lower legs just above the heels. Curl your legs downward by flexing the hamstrings through the full range. Lower slowly and under control. Avoid letting your hips lift off the seat to compensate.',
  },
  {
    name: 'Walking Lunge',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["quads","glutes"]',
    secondary_muscles: '["hamstrings","core"]',
    met_value: 5.0,
    gif_remote: 'videos/1460-IZVHb27.gif',
    gif_slug: 'walking-lunge',
    description: 'Stand tall. Step forward with one foot and lower your back knee toward the floor — front shin vertical, front knee tracking over the ankle. Drive through the front foot to stand, then step the other foot forward. Maintain an upright torso throughout.',
  },
  {
    name: 'Sumo Deadlift',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["glutes","hamstrings"]',
    secondary_muscles: '["quads","lower_back","lats"]',
    met_value: 6.0,
    gif_remote: 'videos/0117-KgI0tqW.gif',
    gif_slug: 'sumo-deadlift',
    description: 'Stand wide, toes turned out 30–45°. Grip the bar inside your legs. Set your hips low, chest up, arms straight. Drive through the floor with your legs and pull the bar close to the body. Lock hips and knees simultaneously at the top.',
  },
  {
    name: 'Arnold Press',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["shoulders"]',
    secondary_muscles: '["triceps"]',
    met_value: 4.5,
    gif_remote: 'videos/2137-Xy4jlWA.gif',
    gif_slug: 'arnold-press',
    description: 'Start seated or standing with dumbbells at shoulder height, palms facing you. As you press overhead, rotate your palms to face forward at the top. Reverse the rotation on the way down back to the start position. The rotation engages all three deltoid heads.',
  },
  {
    name: 'Dumbbell Preacher Curl',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["biceps"]',
    secondary_muscles: '["forearms"]',
    met_value: 3.5,
    gif_remote: 'videos/0372-jivWf8n.gif',
    gif_slug: 'dumbbell-preacher-curl',
    description: 'Sit at a preacher bench, upper arms resting flat on the pad. Hold a dumbbell with a supinated grip. Curl up by flexing the bicep — pause at full contraction. Lower slowly to near full extension. The pad eliminates swing and isolates the bicep peak.',
  },
  {
    name: 'EZ Bar Curl',
    category: 'strength',
    exercise_type: 'reps',
    primary_muscles: '["biceps"]',
    secondary_muscles: '["forearms","brachialis"]',
    met_value: 3.5,
    gif_remote: 'videos/0447-6TG6x2w.gif',
    gif_slug: 'ez-bar-curl',
    description: 'Stand with an EZ bar gripped at the angled sections, palms facing up at ~45°. Keeping upper arms stationary at your sides, curl the bar up by flexing the biceps. Lower slowly. The angled grip reduces wrist and elbow stress vs. a straight bar.',
  },
];

function download(url, dest) {
  return new Promise((resolve, reject) => {
    if (fs.existsSync(dest)) { resolve('exists'); return; }
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        download(res.headers.location, dest).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        reject(new Error('HTTP ' + res.statusCode + ' for ' + url));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve('downloaded'); });
    }).on('error', e => { try { fs.unlinkSync(dest); } catch {} reject(e); });
  });
}

const insertEx = db.prepare(`
  INSERT INTO exercises (name, category, exercise_type, primary_muscles, secondary_muscles, met_value, gif_url, description)
  VALUES (@name, @category, @exercise_type, @primary_muscles, @secondary_muscles, @met_value, @gif_url, @description)
  ON CONFLICT(name) DO NOTHING
`);

(async () => {
  fs.mkdirSync(GIF_DIR, { recursive: true });

  for (const ex of EXERCISES) {
    const existing = db.prepare('SELECT id FROM exercises WHERE name = ?').get(ex.name);
    if (existing) {
      console.log(`SKIP (exists): ${ex.name}`);
      continue;
    }

    const gifLocal = `/exercises/${ex.gif_slug}.gif`;
    const gifDest  = path.join(GIF_DIR, `${ex.gif_slug}.gif`);
    const gifUrl   = GIF_BASE + ex.gif_remote;

    process.stdout.write(`Downloading GIF for "${ex.name}"... `);
    try {
      const status = await download(gifUrl, gifDest);
      console.log(status);
    } catch (e) {
      console.log(`FAILED: ${e.message} — inserting without GIF`);
      const result = db.prepare(`
        INSERT INTO exercises (name, category, exercise_type, primary_muscles, secondary_muscles, met_value, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(ex.name, ex.category, ex.exercise_type, ex.primary_muscles, ex.secondary_muscles, ex.met_value, ex.description);
      console.log(`  Inserted ${ex.name} (id=${result.lastInsertRowid}, no GIF)`);
      continue;
    }

    const result = db.prepare(`
      INSERT INTO exercises (name, category, exercise_type, primary_muscles, secondary_muscles, met_value, gif_url, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(ex.name, ex.category, ex.exercise_type, ex.primary_muscles, ex.secondary_muscles, ex.met_value, gifLocal, ex.description);
    console.log(`  Inserted ${ex.name} (id=${result.lastInsertRowid})`);
  }

  console.log('\nDone. Final counts:');
  const total = db.prepare('SELECT COUNT(*) as n FROM exercises').get();
  const withGif = db.prepare("SELECT COUNT(*) as n FROM exercises WHERE gif_url LIKE '/exercises/%'").get();
  console.log(`  Total exercises: ${total.n}`);
  console.log(`  With local GIFs: ${withGif.n}`);
})();
