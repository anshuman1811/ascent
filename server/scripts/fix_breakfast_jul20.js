/**
 * Fix Anshuman's breakfast on 2026-07-20:
 * Delete the wrong entries and log the correct Overnight Chia Oats.
 *
 * Ingredients:
 *   1/3 cup  TJ's Old Fashioned Rolled Oats    (id=390, 45g/½cup → 30g)
 *   1/4 btl  Fairlife Nutrition Plan Chocolate  (id=105, 325ml/btl → 81.25ml)
 *   3/16 cup Knudsen 4% Cottage Cheese          (id=391, 113g/½cup → 42g)
 *   1 tbsp   Chia Seeds                         (id=61,  28g/svg  → 12g)
 *   ½ cup    Blueberry                          (id=56,  100g/svg → 74g)
 *   1 pack   Chobani Complete Raspberry Lemon   (new,    170g/svg → 170g)
 */

const path = require('path');
const Database = require('better-sqlite3');
const DB_PATH = path.join(__dirname, '../../data/fitness.db');
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function r(v) { return Math.round((v || 0) * 10) / 10; }

function macros(food, qty) {
  const s = qty / food.serving_size;
  return {
    calories:        r(food.calories        * s),
    protein_g:       r(food.protein_g       * s),
    carbs_g:         r(food.carbs_g         * s),
    fat_g:           r(food.fat_g           * s),
    saturated_fat_g: r((food.saturated_fat_g||0) * s),
    fiber_g:         r((food.fiber_g||0)    * s),
    sugar_g:         r((food.sugar_g||0)    * s),
    cholesterol_mg:  r((food.cholesterol_mg||0) * s),
    sodium_mg:       r((food.sodium_mg||0)  * s),
    potassium_mg:    r((food.potassium_mg||0) * s),
    added_sugar_g:   null,
  };
}

function sumMacros(arr) {
  return arr.reduce((a, b) => ({
    calories:        r(a.calories        + b.calories),
    protein_g:       r(a.protein_g       + b.protein_g),
    carbs_g:         r(a.carbs_g         + b.carbs_g),
    fat_g:           r(a.fat_g           + b.fat_g),
    saturated_fat_g: r(a.saturated_fat_g + b.saturated_fat_g),
    fiber_g:         r(a.fiber_g         + b.fiber_g),
    sugar_g:         r(a.sugar_g         + b.sugar_g),
    cholesterol_mg:  r(a.cholesterol_mg  + b.cholesterol_mg),
    sodium_mg:       r(a.sodium_mg       + b.sodium_mg),
    potassium_mg:    r(a.potassium_mg    + b.potassium_mg),
    added_sugar_g:   null,
  }));
}

const run = db.transaction(() => {
  // ── 1. Delete the wrong breakfast items ──────────────────────────────────
  console.log('Deleting meal items 177 (Overnight Chia Oats) and 178 (Mixed Ingredients test)...');
  db.prepare('DELETE FROM meal_items WHERE id IN (177, 178)').run();

  // ── 2. Add Chobani Complete Raspberry Lemon ──────────────────────────────
  console.log('Adding Chobani Complete Raspberry Lemon...');
  const chobaniFoodId = db.prepare(`
    INSERT INTO foods
      (name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g,
       saturated_fat_g, fiber_g, sugar_g, cholesterol_mg, sodium_mg)
    VALUES
      ('Complete Greek Yogurt - Raspberry Lemon', 'Chobani', 170, 'g',
       140, 20, 11, 2.5, 1.5, 0, 7, 10, 65)
  `).run().lastInsertRowid;
  console.log('  → food id:', chobaniFoodId);

  // ── 3. Ingredient list with quantities in food's base unit ───────────────
  const ingredients = [
    { food_id: 390, qty: 30    },   // TJ's Rolled Oats: 1/3 cup = 30g
    { food_id: 105, qty: 81.25 },   // Fairlife Choc: 1/4 bottle = 81.25ml
    { food_id: 391, qty: 42    },   // Knudsen CC: 3/16 cup ≈ 42g
    { food_id: 61,  qty: 12    },   // Chia Seeds: 1 tbsp ≈ 12g
    { food_id: 56,  qty: 74    },   // Blueberries: 1/2 cup ≈ 74g
    { food_id: chobaniFoodId, qty: 170 }, // Chobani Raspberry Lemon: 1 pack
  ];

  // ── 4. Compute per-ingredient macros and sum ─────────────────────────────
  const getFoodStmt = db.prepare('SELECT * FROM foods WHERE id = ?');
  const ingredMacros = ingredients.map(({ food_id, qty }) => {
    const food = getFoodStmt.get(food_id);
    return { food_id, qty, food, m: macros(food, qty) };
  });

  const total = sumMacros(ingredMacros.map(i => i.m));
  console.log('\nIngredient breakdown:');
  for (const { food_id, qty, food, m } of ingredMacros) {
    console.log(`  [${food_id}] ${food.name}: ${qty}${food.serving_unit} → ${m.calories} kcal, ${m.protein_g}P, ${m.carbs_g}C, ${m.fat_g}F, ${m.fiber_g}fib`);
  }
  console.log(`\nTotal: ${total.calories} kcal, ${total.protein_g}P, ${total.carbs_g}C, ${total.fat_g}F, ${total.fiber_g}fib, ${total.sugar_g}sug`);

  // ── 5. Create composite food "Overnight Chia Oats" ───────────────────────
  console.log('\nCreating composite food...');
  const compositeFoodId = db.prepare(`
    INSERT INTO foods
      (name, brand, serving_size, serving_unit, calories, protein_g, carbs_g, fat_g,
       saturated_fat_g, fiber_g, sugar_g, cholesterol_mg, sodium_mg, potassium_mg, added_sugar_g)
    VALUES (?, 'Quick Entry', 1, 'serving', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
  `).run(
    'Overnight Chia Oats',
    total.calories, total.protein_g, total.carbs_g, total.fat_g,
    total.saturated_fat_g, total.fiber_g, total.sugar_g,
    total.cholesterol_mg, total.sodium_mg, total.potassium_mg
  ).lastInsertRowid;
  console.log('  → composite food id:', compositeFoodId);

  // ── 6. Add food_ingredients records ──────────────────────────────────────
  const insertIngred = db.prepare(
    'INSERT INTO food_ingredients (food_id, ingredient_food_id, quantity) VALUES (?, ?, ?)'
  );
  for (const { food_id, qty } of ingredMacros) {
    insertIngred.run(compositeFoodId, food_id, qty);
  }
  console.log('  → ingredients saved');

  // ── 7. Add the composite item to breakfast (meal 117) ────────────────────
  console.log('\nAdding to breakfast meal 117...');
  db.prepare(`
    INSERT INTO meal_items
      (meal_id, food_id, quantity, calories, protein_g, carbs_g, fat_g,
       saturated_fat_g, fiber_g, sugar_g, added_sugar_g, cholesterol_mg, sodium_mg, potassium_mg)
    VALUES (117, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(
    compositeFoodId,
    total.calories, total.protein_g, total.carbs_g, total.fat_g,
    total.saturated_fat_g, total.fiber_g, total.sugar_g,
    total.cholesterol_mg, total.sodium_mg, total.potassium_mg
  );

  // ── 8. Verify final breakfast ─────────────────────────────────────────────
  console.log('\n=== Final breakfast (meal 117) ===');
  const items = db.prepare(`
    SELECT mi.id, f.name, f.brand, mi.quantity, mi.calories, mi.protein_g, mi.carbs_g
    FROM meal_items mi JOIN foods f ON f.id = mi.food_id
    WHERE mi.meal_id = 117
  `).all();
  items.forEach(i => console.log(`  [mi.${i.id}] ${i.name} (${i.brand}): ${i.quantity}×  → ${i.calories} kcal, ${i.protein_g}P, ${i.carbs_g}C`));
});

run();
