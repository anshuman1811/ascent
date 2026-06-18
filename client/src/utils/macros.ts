import type { MacroTotals } from '../types';

const ZERO: MacroTotals = {
  calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  saturated_fat_g: 0, fiber_g: 0, sugar_g: 0, added_sugar_g: 0,
  cholesterol_mg: 0, sodium_mg: 0, potassium_mg: 0,
};

function r(v: number) { return Math.round((v || 0) * 10) / 10; }

export function scaleMacros(food: MacroTotals & { serving_size: number }, quantity: number): MacroTotals {
  const scale = quantity / food.serving_size;
  return {
    calories:        r(food.calories        * scale),
    protein_g:       r(food.protein_g       * scale),
    carbs_g:         r(food.carbs_g         * scale),
    fat_g:           r(food.fat_g           * scale),
    saturated_fat_g: r(food.saturated_fat_g * scale),
    fiber_g:         r(food.fiber_g         * scale),
    sugar_g:         r(food.sugar_g         * scale),
    added_sugar_g:   r((food.added_sugar_g ?? 0) * scale),
    cholesterol_mg:  r(food.cholesterol_mg  * scale),
    sodium_mg:       r(food.sodium_mg       * scale),
    potassium_mg:    r(food.potassium_mg    * scale),
  };
}

export function sumMacros(items: MacroTotals[]): MacroTotals {
  return items.reduce((acc, i) => ({
    calories:        acc.calories        + (i.calories        || 0),
    protein_g:       acc.protein_g       + (i.protein_g       || 0),
    carbs_g:         acc.carbs_g         + (i.carbs_g         || 0),
    fat_g:           acc.fat_g           + (i.fat_g           || 0),
    saturated_fat_g: acc.saturated_fat_g + (i.saturated_fat_g || 0),
    fiber_g:         acc.fiber_g         + (i.fiber_g         || 0),
    sugar_g:         acc.sugar_g         + (i.sugar_g         || 0),
    added_sugar_g:   acc.added_sugar_g   + (i.added_sugar_g   || 0),
    cholesterol_mg:  acc.cholesterol_mg  + (i.cholesterol_mg  || 0),
    sodium_mg:       acc.sodium_mg       + (i.sodium_mg       || 0),
    potassium_mg:    acc.potassium_mg    + (i.potassium_mg    || 0),
  }), { ...ZERO });
}

export function macroCalories(macros: MacroTotals): { protein: number; carbs: number; fat: number } {
  return {
    protein: macros.protein_g * 4,
    carbs:   macros.carbs_g   * 4,
    fat:     macros.fat_g     * 9,
  };
}
