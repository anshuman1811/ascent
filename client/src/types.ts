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
  sugar_target_g?: number;
  sodium_target_mg?: number;
  added_sugar_target_g?: number;
  saturated_fat_target_g?: number;
  cholesterol_target_mg?: number;
  potassium_target_mg?: number;
  /** JSON-parsed array of macro field names shown on the dashboard. NULL = use defaults. */
  tracked_macros?: string[];
  weight_goal_type: 'lose' | 'lose_mild' | 'maintain' | 'gain' | 'gain_aggressive';
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
  /** Added sugar (excludes natural sugars). NULL = data not available for this food. */
  added_sugar_g?: number | null;
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
  added_sugar_g?: number | null;
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
  added_sugar_g: number;
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
  description?: string;
  gif_url?: string;
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
  description?: string;
  exercise_notes?: string;
  gif_url?: string;
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
  actual_rest_seconds?: number;
  notes?: string;
}

export interface SessionExercise {
  id: number;
  session_id: number;
  exercise_id: number;
  exercise_name: string;
  exercise_type: 'reps' | 'timed';
  primary_muscles: string[];
  secondary_muscles: string[];
  order_index: number;
  target_sets: number;
  target_reps?: number;
  target_duration_seconds?: number;
  target_weight_value?: number;
  target_weight_unit: string;
  rest_seconds: number;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  sets: SetLog[];
  description?: string;
  gif_url?: string;
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

export interface FoodIngredient {
  id: number;
  food_id: number;
  ingredient_food_id: number;
  quantity: number;
  // denormalized from the ingredient food
  name: string;
  brand?: string;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  sugar_g: number;
}

// ─── Macro configuration ──────────────────────────────────────────────────────

export type MacroKey =
  | 'protein_g' | 'carbs_g' | 'fat_g' | 'fiber_g'
  | 'sugar_g' | 'added_sugar_g' | 'saturated_fat_g'
  | 'sodium_mg' | 'cholesterol_mg' | 'potassium_mg';

export interface MacroInfo {
  key: MacroKey;
  label: string;
  sublabel?: string;
  /** Key on User for the target value; null = informational only, no target */
  targetKey: keyof User | null;
  unit: string;
  /** Hex color for progress bars and ring segments */
  color: string;
  /** Default tracked on dashboard for new users */
  defaultTracked: boolean;
  /** Slider/input max for the Profile UI */
  inputMax: number;
  inputStep: number;
}

export const MACRO_CONFIG: MacroInfo[] = [
  { key: 'protein_g',       label: 'Protein',       unit: 'g',  targetKey: 'protein_target_g',       color: '#38bdf8', defaultTracked: true,  inputMax: 300,  inputStep: 5 },
  { key: 'carbs_g',         label: 'Net Carbs',     unit: 'g',  targetKey: 'carbs_target_g',         color: '#fbbf24', defaultTracked: true,  inputMax: 600,  inputStep: 10, sublabel: 'total − fiber' },
  { key: 'fat_g',           label: 'Fat',           unit: 'g',  targetKey: 'fat_target_g',           color: '#fb923c', defaultTracked: true,  inputMax: 200,  inputStep: 5 },
  { key: 'fiber_g',         label: 'Fiber',         unit: 'g',  targetKey: 'fiber_target_g',         color: '#34d399', defaultTracked: true,  inputMax: 60,   inputStep: 1 },
  { key: 'sugar_g',         label: 'Total Sugar',   unit: 'g',  targetKey: null,                     color: '#facc15', defaultTracked: false, inputMax: 200,  inputStep: 5,  sublabel: 'incl. natural' },
  { key: 'added_sugar_g',   label: 'Added Sugar',   unit: 'g',  targetKey: 'added_sugar_target_g',   color: '#f472b6', defaultTracked: false, inputMax: 100,  inputStep: 5,  sublabel: 'excl. natural' },
  { key: 'saturated_fat_g', label: 'Saturated Fat', unit: 'g',  targetKey: 'saturated_fat_target_g', color: '#ea580c', defaultTracked: false, inputMax: 50,   inputStep: 1 },
  { key: 'sodium_mg',       label: 'Sodium',        unit: 'mg', targetKey: 'sodium_target_mg',       color: '#a78bfa', defaultTracked: false, inputMax: 5000, inputStep: 100 },
  { key: 'cholesterol_mg',  label: 'Cholesterol',   unit: 'mg', targetKey: 'cholesterol_target_mg',  color: '#f472b6', defaultTracked: false, inputMax: 500,  inputStep: 10 },
  { key: 'potassium_mg',    label: 'Potassium',     unit: 'mg', targetKey: 'potassium_target_mg',    color: '#2dd4bf', defaultTracked: false, inputMax: 5000, inputStep: 100 },
];

export const DEFAULT_TRACKED_MACROS: MacroKey[] = ['protein_g', 'carbs_g', 'fat_g', 'fiber_g'];
