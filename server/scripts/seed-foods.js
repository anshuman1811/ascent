// One-off seed script: adds common branded foods with nutrition-label-accurate macros.
// Run with: node server/scripts/seed-foods.js
const db = require('../db/index');

// Each entry maps directly to the `foods` table. Values sourced from each brand's
// published Nutrition Facts panel (per the stated serving size).
const FOODS = [
  {
    name: 'Butter Croissant', brand: 'Kirkland Signature (Costco)',
    serving_size: 85, serving_unit: 'g',
    calories: 300, protein_g: 6, carbs_g: 32, fat_g: 17, saturated_fat_g: 10,
    fiber_g: 1, sugar_g: 5, cholesterol_mg: 45, sodium_mg: 350,
  },
  {
    name: 'Cream Cheese, Original', brand: 'Philadelphia',
    serving_size: 28, serving_unit: 'g',
    calories: 100, protein_g: 2, carbs_g: 1, fat_g: 9, saturated_fat_g: 6,
    fiber_g: 0, sugar_g: 1, cholesterol_mg: 30, sodium_mg: 90,
  },
  {
    name: 'Cream Cheese Spread, Whipped', brand: 'Philadelphia',
    serving_size: 24, serving_unit: 'g',
    calories: 70, protein_g: 1, carbs_g: 1, fat_g: 7, saturated_fat_g: 4.5,
    fiber_g: 0, sugar_g: 1, cholesterol_mg: 20, sodium_mg: 80,
  },
  {
    name: 'Cream Cheese, Light (Neufchâtel)', brand: 'Philadelphia',
    serving_size: 28, serving_unit: 'g',
    calories: 60, protein_g: 3, carbs_g: 2, fat_g: 5, saturated_fat_g: 3.5,
    fiber_g: 0, sugar_g: 2, cholesterol_mg: 20, sodium_mg: 130,
  },
  {
    name: 'Cream Cheese Spread, Strawberry', brand: 'Philadelphia',
    serving_size: 30, serving_unit: 'g',
    calories: 90, protein_g: 1, carbs_g: 8, fat_g: 7, saturated_fat_g: 4.5,
    fiber_g: 0, sugar_g: 6, added_sugar_g: 6, cholesterol_mg: 20, sodium_mg: 75,
  },
  {
    name: 'Cream Cheese Spread, Chive & Onion', brand: 'Philadelphia',
    serving_size: 30, serving_unit: 'g',
    calories: 90, protein_g: 2, carbs_g: 2, fat_g: 8, saturated_fat_g: 5,
    fiber_g: 0, sugar_g: 1, cholesterol_mg: 25, sodium_mg: 130,
  },
  {
    name: 'Cream Cheese Spread, Garden Vegetable', brand: 'Philadelphia',
    serving_size: 30, serving_unit: 'g',
    calories: 80, protein_g: 2, carbs_g: 2, fat_g: 7, saturated_fat_g: 4.5,
    fiber_g: 0, sugar_g: 1, cholesterol_mg: 20, sodium_mg: 140,
  },
  {
    name: 'Cream Cheese Spread, Honey Nut', brand: 'Philadelphia',
    serving_size: 30, serving_unit: 'g',
    calories: 90, protein_g: 1, carbs_g: 7, fat_g: 7, saturated_fat_g: 4.5,
    fiber_g: 0, sugar_g: 6, added_sugar_g: 5, cholesterol_mg: 20, sodium_mg: 60,
  },
  {
    name: 'Whole Ultra-Filtered Milk', brand: 'Fairlife',
    serving_size: 240, serving_unit: 'ml',
    calories: 150, protein_g: 13, carbs_g: 6, fat_g: 8, saturated_fat_g: 5,
    fiber_g: 0, sugar_g: 6, cholesterol_mg: 35, sodium_mg: 95, potassium_mg: 480,
  },
  {
    name: '2% Reduced Fat Ultra-Filtered Milk', brand: 'Fairlife',
    serving_size: 240, serving_unit: 'ml',
    calories: 120, protein_g: 13, carbs_g: 6, fat_g: 5, saturated_fat_g: 3,
    fiber_g: 0, sugar_g: 6, cholesterol_mg: 20, sodium_mg: 95, potassium_mg: 480,
  },
  {
    name: 'Fat Free Skim Ultra-Filtered Milk', brand: 'Fairlife',
    serving_size: 240, serving_unit: 'ml',
    calories: 80, protein_g: 13, carbs_g: 6, fat_g: 0, saturated_fat_g: 0,
    fiber_g: 0, sugar_g: 6, cholesterol_mg: 5, sodium_mg: 100, potassium_mg: 480,
  },
  {
    name: '2% Chocolate Ultra-Filtered Milk', brand: 'Fairlife',
    serving_size: 240, serving_unit: 'ml',
    calories: 150, protein_g: 13, carbs_g: 14, fat_g: 5, saturated_fat_g: 3,
    fiber_g: 0, sugar_g: 13, added_sugar_g: 8, cholesterol_mg: 20, sodium_mg: 170, potassium_mg: 500,
  },
  {
    name: 'Genova Basil Pesto', brand: "Trader Joe's",
    serving_size: 32, serving_unit: 'g',
    calories: 150, protein_g: 3, carbs_g: 3, fat_g: 14, saturated_fat_g: 3,
    fiber_g: 1, sugar_g: 1, cholesterol_mg: 5, sodium_mg: 310,
  },
  // Note: Quaker oat varieties (Old Fashioned, Quick Oats, Instant Oatmeal Original /
  // Maple & Brown Sugar) were already present in the library before this seed ran —
  // intentionally not duplicated here.
];

const insert = db.prepare(`
  INSERT INTO foods (name, brand, serving_size, serving_unit, calories, protein_g,
    carbs_g, fat_g, fiber_g, sugar_g, added_sugar_g, saturated_fat_g, cholesterol_mg,
    sodium_mg, potassium_mg)
  VALUES (@name, @brand, @serving_size, @serving_unit, @calories, @protein_g,
    @carbs_g, @fat_g, @fiber_g, @sugar_g, @added_sugar_g, @saturated_fat_g, @cholesterol_mg,
    @sodium_mg, @potassium_mg)
`);

const existsStmt = db.prepare('SELECT id FROM foods WHERE name = ? AND brand = ?');

let added = 0, skipped = 0;
for (const f of FOODS) {
  if (existsStmt.get(f.name, f.brand)) { skipped++; continue; }
  insert.run({
    added_sugar_g: null, saturated_fat_g: 0, cholesterol_mg: 0, sodium_mg: 0, potassium_mg: 0,
    ...f,
  });
  added++;
}

console.log(`Seeded foods: ${added} added, ${skipped} already existed.`);
