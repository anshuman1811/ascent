export interface User {
  id: number;
  name: string;
  avatar_color: string;
  birth_date?: string;
  sex?: 'male' | 'female' | 'other';
  height_value?: number;
  height_unit: 'ft' | 'cm';
  activity_level: 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
  calorie_target?: number;
  tdee_estimate?: number;
  protein_target_g?: number;
  carbs_target_g?: number;
  fat_target_g?: number;
  fiber_target_g?: number;
  sodium_target_mg?: number;
  weight_goal_type: 'lose' | 'maintain' | 'gain';
  target_weight_value?: number;
  target_weight_unit: string;
  weight_unit: 'lb' | 'kg';
  volume_unit: 'oz' | 'ml';
  length_unit: 'ft' | 'cm';
}

export interface Food {
  id: number;
  name: string;
  brand?: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saturated_fat_g: number;
  fiber_g: number;
  sugar_g: number;
  cholesterol_mg: number;
  sodium_mg: number;
  potassium_mg: number;
  created_by?: number;
  created_at: string;
}

export interface MealItem {
  id: number;
  meal_id: number;
  food_id: number;
  food_name: string;
  brand?: string;
  serving_size: number;
  serving_unit: string;
  quantity: number;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saturated_fat_g: number;
  fiber_g: number;
  sugar_g: number;
  cholesterol_mg: number;
  sodium_mg: number;
  potassium_mg: number;
}

export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'pre_workout' | 'post_workout';

export interface Meal {
  id: number;
  user_id: number;
  meal_type: MealType;
  notes?: string;
  logged_at: string;
  items: MealItem[];
  totals: MacroTotals;
}

export interface MacroTotals {
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  saturated_fat_g: number;
  fiber_g: number;
  sugar_g: number;
  cholesterol_mg: number;
  sodium_mg: number;
  potassium_mg: number;
}

export type ExerciseCategory = 'strength' | 'cardio' | 'warmup' | 'cooldown';

export interface Exercise {
  id: number;
  name: string;
  exercise_type: 'reps' | 'timed';
  category: ExerciseCategory;
  primary_muscles: string[];
  secondary_muscles: string[];
  met_value: number;
  notes?: string;
}

export interface RoutineExercise {
  id: number;
  routine_id: number;
  exercise_id: number;
  exercise_name: string;
  exercise_type: 'reps' | 'timed';
  category: ExerciseCategory;
  primary_muscles: string[];
  secondary_muscles: string[];
  order_index: number;
  sets: number;
  reps?: number;
  duration_seconds?: number;
  weight_value?: number;
  weight_unit: string;
  rest_seconds: number;
}

export interface Routine {
  id: number;
  user_id: number;
  name: string;
  notes?: string;
  exercises: RoutineExercise[];
}

export interface SetLog {
  id: number;
  session_exercise_id: number;
  set_number: number;
  actual_reps?: number;
  actual_duration_seconds?: number;
  actual_weight_value?: number;
  actual_weight_unit: string;
  is_pb: number;
  logged_at: string;
}

export interface SessionExercise {
  id: number;
  session_id: number;
  exercise_id: number;
  exercise_name: string;
  exercise_type: 'reps' | 'timed';
  primary_muscles: string[];
  order_index: number;
  target_sets: number;
  target_reps?: number;
  target_duration_seconds?: number;
  target_weight_value?: number;
  target_weight_unit: string;
  rest_seconds: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  sets: SetLog[];
}

export interface WorkoutSession {
  id: number;
  user_id: number;
  routine_id?: number;
  routine_name?: string;
  name: string;
  started_at: string;
  completed_at?: string;
  status: 'in_progress' | 'completed' | 'abandoned';
  total_rest_seconds: number;
  calories_burned?: number;
  exercises: SessionExercise[];
}

export interface DailySummary {
  date: string;
  meals: MacroTotals;
  exercise: { calories_burned: number; session_count: number };
  net_calories: number;
  classification: 'deficit' | 'surplus' | 'maintenance' | null;
  meal_breakdown: Array<{ meal_type: MealType; calories: number; protein_g: number; carbs_g: number; fat_g: number }>;
  targets: Partial<User>;
  latest_weight: { weight_value: number; weight_unit: string } | null;
}

export interface WeightLog {
  id: number;
  user_id: number;
  weight_value: number;
  weight_unit: string;
  logged_at: string;
}
