import { toKg, toCm, type WeightUnit, type LengthUnit } from './units';

type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
type Sex = 'male' | 'female' | 'other';

const ACTIVITY_MULTIPLIERS: Record<ActivityLevel, number> = {
  sedentary:  1.2,
  light:      1.375,
  moderate:   1.55,
  active:     1.725,
  very_active: 1.9,
};

export function calculateTDEE(params: {
  weight_value: number;
  weight_unit: WeightUnit;
  height_value: number;
  height_unit: LengthUnit;
  birth_date: string;
  sex: Sex;
  activity_level: ActivityLevel;
}): number {
  const { weight_value, weight_unit, height_value, height_unit, birth_date, sex, activity_level } = params;

  const weightKg = toKg(weight_value, weight_unit);
  const heightCm = toCm(height_value, height_unit);
  const age = Math.floor((Date.now() - new Date(birth_date).getTime()) / (365.25 * 24 * 3600 * 1000));

  // Mifflin-St Jeor
  let bmr = 10 * weightKg + 6.25 * heightCm - 5 * age;
  bmr += sex === 'male' ? 5 : -161;

  return Math.round(bmr * ACTIVITY_MULTIPLIERS[activity_level]);
}

export const ACTIVITY_LABELS: Record<ActivityLevel, string> = {
  sedentary:   'Sedentary (desk job, no exercise)',
  light:       'Lightly active (1–3 days/week)',
  moderate:    'Moderately active (3–5 days/week)',
  active:      'Very active (6–7 days/week)',
  very_active: 'Extra active (physical job + training)',
};
