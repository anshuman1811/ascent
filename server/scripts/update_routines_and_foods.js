/**
 * Applies routine updates based on actual workout data + adds new foods.
 * Run with: node server/scripts/update_routines_and_foods.js
 */
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../data/fitness.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const run = db.transaction(() => {

  // ── ROUTINE 3 (Anshuman - Lower Body Strength Focus) ────────────────────────
  // Add Kneeling Cable Crunch (exId=124) 3×8 before the cooldown stretches.
  // Cooldown: re.id=659 (Couch Stretch, idx 7), re.id=660 (Ham Stretch, idx 8)
  console.log('Routine 3: shifting cooldown and inserting Kneeling Cable Crunch at idx 7...');
  db.prepare('UPDATE routine_exercises SET order_index = 9 WHERE id = 660').run();
  db.prepare('UPDATE routine_exercises SET order_index = 8 WHERE id = 659').run();
  db.prepare(`
    INSERT INTO routine_exercises (routine_id, exercise_id, order_index, sets, reps, rest_seconds)
    VALUES (3, 124, 7, 3, 8, 60)
  `).run();

  // ── ROUTINE 5 (Anshuman - Lower Body Hypertrophy Focus) ─────────────────────
  // Remove Cable Pull-Through (677) and Seated Calf Raise (679).
  // Update Goblet Squat (676) to 3×12.
  // Add KB Swing (65, 3×15) and RDL (13, 3×10).
  // Final order (0-9): warmup×3, KB Swing, Goblet Squat, RDL, SL Cable Curl, KCC, Couch, Ham.
  console.log('Routine 5: removing 2, updating Goblet Squat, adding KB Swing + RDL, reordering...');
  db.prepare('DELETE FROM routine_exercises WHERE id IN (677, 679)').run();
  db.prepare('UPDATE routine_exercises SET sets = 3, reps = 12 WHERE id = 676').run();

  // Reindex the still-existing exercises to their target positions
  // 673(WGS)→0, 674(90/90)→1, 675(Glute)→2, [new KB Swing]→3, 676(Goblet)→4, [new RDL]→5, 678(SL Curl)→6, 680(KCC)→7, 681(Couch)→8, 682(Ham)→9
  db.prepare('UPDATE routine_exercises SET order_index = 0  WHERE id = 673').run();
  db.prepare('UPDATE routine_exercises SET order_index = 1  WHERE id = 674').run();
  db.prepare('UPDATE routine_exercises SET order_index = 2  WHERE id = 675').run();
  db.prepare('UPDATE routine_exercises SET order_index = 4  WHERE id = 676').run(); // Goblet after new KB Swing
  db.prepare('UPDATE routine_exercises SET order_index = 6  WHERE id = 678').run();
  db.prepare('UPDATE routine_exercises SET order_index = 7  WHERE id = 680').run();
  db.prepare('UPDATE routine_exercises SET order_index = 8  WHERE id = 681').run();
  db.prepare('UPDATE routine_exercises SET order_index = 9  WHERE id = 682').run();
  db.prepare(`
    INSERT INTO routine_exercises (routine_id, exercise_id, order_index, sets, reps, rest_seconds)
    VALUES (5, 65, 3, 3, 15, 60)
  `).run(); // KB Swing at idx 3
  db.prepare(`
    INSERT INTO routine_exercises (routine_id, exercise_id, order_index, sets, reps, rest_seconds)
    VALUES (5, 13, 5, 3, 10, 90)
  `).run(); // RDL at idx 5

  // ── ROUTINE 6 (Anshuman - Upper Body Hypertrophy & Incline Focus) ───────────
  // Move Face Pull (re.id=691, exId=16) from idx 8 → idx 6 (3rd working exercise).
  // Dumbbell Bench (689) and Lateral Raise (690) shift down by one.
  console.log('Routine 6: moving Face Pull to 3rd position...');
  db.prepare('UPDATE routine_exercises SET order_index = 6  WHERE id = 691').run();
  db.prepare('UPDATE routine_exercises SET order_index = 7  WHERE id = 689').run();
  db.prepare('UPDATE routine_exercises SET order_index = 8  WHERE id = 690').run();
  // Cooldown (re.id=692, 693) stays at idx 9, 10 — unchanged.

  // ── ROUTINE 9 (Aastha - Lower Body Hypertrophy & Hinge) ─────────────────────
  // Remove Cable Pull-Through (re.id=719).
  // Reorder: KB Swing first, Goblet before RDL, add Kneeling Cable Crunch.
  // Final: warmup×3, KB Swing (721), Goblet (718), RDL (717), SL Curl (720), KCC (new), Couch (722), Ham (723)
  console.log('Routine 9: removing Cable Pull-Through, reordering, adding Kneeling Cable Crunch...');
  db.prepare('DELETE FROM routine_exercises WHERE id = 719').run();
  db.prepare('UPDATE routine_exercises SET order_index = 0  WHERE id = 714').run();
  db.prepare('UPDATE routine_exercises SET order_index = 1  WHERE id = 715').run();
  db.prepare('UPDATE routine_exercises SET order_index = 2  WHERE id = 716').run();
  db.prepare('UPDATE routine_exercises SET order_index = 3  WHERE id = 721').run(); // KB Swing → 1st
  db.prepare('UPDATE routine_exercises SET order_index = 4  WHERE id = 718').run(); // Goblet → 2nd
  db.prepare('UPDATE routine_exercises SET order_index = 5  WHERE id = 717').run(); // RDL → 3rd
  db.prepare('UPDATE routine_exercises SET order_index = 6  WHERE id = 720').run(); // SL Curl
  db.prepare('UPDATE routine_exercises SET order_index = 8  WHERE id = 722').run(); // Couch (cooldown)
  db.prepare('UPDATE routine_exercises SET order_index = 9  WHERE id = 723').run(); // Ham (cooldown)
  db.prepare(`
    INSERT INTO routine_exercises (routine_id, exercise_id, order_index, sets, reps, rest_seconds)
    VALUES (9, 124, 7, 3, 8, 60)
  `).run(); // Kneeling Cable Crunch at idx 7

  // ── ROUTINE 10 (Aastha - Upper Body Hypertrophy & Shoulder Focus) ───────────
  // Swap Overhead Press (re.id=728, exId=5) → Dumbbell Shoulder Press (exId=57).
  // Swap Cable Tricep Pushdown (re.id=732, exId=79) → Overhead Tricep Extension (exId=126).
  console.log('Routine 10: swapping Overhead Press → Dumbbell Shoulder Press, Cable Tricep → OTE...');
  db.prepare('UPDATE routine_exercises SET exercise_id = 57 WHERE id = 728').run();
  db.prepare('UPDATE routine_exercises SET exercise_id = 126 WHERE id = 732').run();

  // ── NEW FOODS ────────────────────────────────────────────────────────────────
  console.log('Adding Trader Joe\'s Rolled Oats and Knudsen Cottage Cheese...');

  // Trader Joe's Old Fashioned Rolled Oats (per 40g / ~1/2 cup dry)
  db.prepare(`
    INSERT INTO foods (name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g)
    VALUES ('Old Fashioned Rolled Oats', 'Trader Joe''s', 40, 'g', 150, 5, 27, 3, 4, 1)
  `).run();

  // Knudsen 4% Milkfat Cottage Cheese (per 113g / ~1/2 cup) — Costco size
  db.prepare(`
    INSERT INTO foods (name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g)
    VALUES ('Cottage Cheese 4% Milkfat', 'Knudsen', 113, 'g', 110, 12, 5, 5, 0, 5)
  `).run();

  console.log('All changes committed successfully.');
});

run();

// Verify final state
console.log('\n=== Final Routine States ===');
for (const rid of [3, 5, 6, 9, 10]) {
  const r = db.prepare('SELECT id, name FROM routines WHERE id = ?').get(rid);
  const exs = db.prepare(`
    SELECT re.id, re.exercise_id, re.order_index, re.sets, re.reps, e.name
    FROM routine_exercises re JOIN exercises e ON e.id = re.exercise_id
    WHERE re.routine_id = ? ORDER BY re.order_index
  `).all(rid);
  console.log(`\nRoutine ${r.id} (${r.name}):`);
  exs.forEach(ex => console.log(`  [${ex.order_index}] ${ex.name} ${ex.sets}x${ex.reps ?? '–'}`));
}

console.log('\n=== New Foods ===');
const newFoods = db.prepare("SELECT id, name, brand, serving_size, serving_unit, calories, protein_g FROM foods WHERE brand IN ('Trader Joe''s', 'Knudsen') ORDER BY id DESC LIMIT 4").all();
newFoods.forEach(f => console.log(`  [${f.id}] ${f.brand} - ${f.name} (${f.serving_size}${f.serving_unit}, ${f.calories}kcal, ${f.protein_g}g protein)`));
