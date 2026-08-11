import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { useState, useRef, useMemo, useEffect, type ChangeEvent } from 'react';
import {
  ChevronLeft, ChevronRight, Flame, Dumbbell, TrendingDown, TrendingUp,
  Plus, Play, Utensils, Zap, ChevronDown, ChevronUp, Clock, Trash2,
  Check, X, Pencil, ListChecks, Timer,
} from 'lucide-react';
import { api } from '../api/client';
import { useAppStore, useWorkoutStore } from '../store/appStore';
import { parseSQLiteLocal, convertToServingUnit, MASS_VOL_UNITS } from '../utils/units';
import { RESTAURANT_FILTERS } from '../utils/restaurantFilters';
import type { DailySummary, MealType, Food, Meal, Routine, WorkoutSession, WorkoutSessionSummary, WorkoutRegime, User } from '../types';
import { MACRO_CONFIG, DEFAULT_TRACKED_MACROS } from '../types';
import { CalorieRing, MacroPills, MacroBar, MacroBreakdown } from '../components/ui/MacroDisplay';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Button from '../components/ui/Button';
import Modal from '../components/ui/Modal';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';

interface OutletCtx { userId: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysAgoLabel(date: Date): string {
  const diff = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff < 7) return `${diff} days ago`;
  if (diff < 14) return '1 week ago';
  return `${Math.floor(diff / 7)} weeks ago`;
}

// ─── Weekly chart custom tooltip ──────────────────────────────────────────────

function WeeklyTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const cls = d.classification;
  const target = d.calorie_target as number | null;
  const eaten = d.calories_in as number;
  const burned = d.calories_burned as number;
  const dayLabel = new Date(d.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const diff = target ? eaten - target : null;
  const statusColor = cls === 'surplus' ? 'text-amber-400' : cls === 'maintenance' ? 'text-green-400' : 'text-sky-400';
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-xl px-3 py-2.5 text-xs space-y-1 shadow-xl pointer-events-none">
      <p className="text-gray-400 font-medium">{dayLabel}</p>
      {eaten > 0 ? (
        <>
          <p className="text-white font-semibold">{eaten} kcal</p>
          {target && diff !== null && (
            <p className={statusColor}>
              {cls === 'surplus' ? `+${diff} over` : cls === 'maintenance' ? 'On target' : `${Math.abs(diff)} under`} goal ({target})
            </p>
          )}
          {burned > 0 && <p className="text-emerald-400">{burned} burned</p>}
          <div className="flex gap-2 text-[10px] text-gray-600 pt-0.5 border-t border-gray-800">
            <span className="text-sky-400/80">{d.protein_g}P</span>
            <span className="text-amber-400/80">{d.carbs_g}C</span>
            <span className="text-orange-400/80">{d.fat_g}F</span>
          </div>
        </>
      ) : (
        <p className="text-gray-600 italic">No meals logged</p>
      )}
    </div>
  );
}

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDefaultMealType(): MealType {
  const h = new Date().getHours();
  if (h >= 5 && h < 10) return 'breakfast';
  if (h >= 10 && h < 14) return 'lunch';
  if (h >= 17 && h < 22) return 'dinner';
  return 'snack';
}

const MEAL_TYPES: { value: MealType; label: string }[] = [
  { value: 'breakfast',    label: '🌅 Breakfast' },
  { value: 'lunch',        label: '☀️ Lunch' },
  { value: 'dinner',       label: '🌙 Dinner' },
  { value: 'snack',        label: '🍎 Snack' },
  { value: 'pre_workout',  label: '⚡ Pre-workout' },
  { value: 'post_workout', label: '💪 Post-workout' },
];

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner',
  snack: 'Snack', pre_workout: 'Pre-workout', post_workout: 'Post-workout',
};

const UNIT_OPTIONS = [
  { value: 'g',       label: 'g' },
  { value: 'ml',      label: 'ml' },
  { value: 'oz',      label: 'oz' },
  { value: 'cup',     label: 'cup' },
  { value: 'tbsp',    label: 'tbsp' },
  { value: 'tsp',     label: 'tsp' },
  { value: 'serving', label: 'serving' },
  { value: 'piece',   label: 'piece' },
];

export default function Dashboard({ userId: propUserId, hidePeer }: { userId?: number; hidePeer?: boolean }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId, users, setActiveUserId } = useAppStore();
  const { setSession } = useWorkoutStore();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;

  const [date, setDate] = useState(fmt(new Date()));
  const isToday = date === fmt(new Date());
  const swipeStartX = useRef(0);
  const swipeStartY = useRef(0);
  const [dragX, setDragX] = useState(0);
  const [swipeTransition, setSwipeTransition] = useState(false);

  // Modals
  const [logMealOpen, setLogMealOpen] = useState(false);
  const [logMealTargetUser, setLogMealTargetUser] = useState<number | null>(null);
  const [addFoodToMeal, setAddFoodToMeal] = useState<{ mealId: number; userId: number } | null>(null);
  const [startWorkoutOpen, setStartWorkoutOpen] = useState(false);
  const [logWorkoutPickerOpen, setLogWorkoutPickerOpen] = useState(false);
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [expandedMeals, setExpandedMeals] = useState<Set<number>>(new Set());
  // track auto-created meal so we can delete it if user closes without adding food
  const [freshMealId, setFreshMealId] = useState<number | null>(null);
  const [viewSessionId, setViewSessionId] = useState<number | null>(null);

  const otherUser = users.find(u => u.id !== userId);

  const { data: summary } = useQuery({
    queryKey: ['daily-summary', userId, date],
    queryFn: () => api.get<DailySummary>(`/dashboard/${userId}/daily?date=${date}`),
    enabled: !!userId,
    refetchInterval: 30_000,
  });

  const { data: otherSummary } = useQuery({
    queryKey: ['daily-summary', otherUser?.id, date],
    queryFn: () => api.get<DailySummary>(`/dashboard/${otherUser!.id}/daily?date=${date}`),
    enabled: !!otherUser,
    refetchInterval: 60_000,
  });

  const weekEnd = fmt(new Date());
  const { data: weekly } = useQuery({
    queryKey: ['weekly', userId, weekEnd],
    queryFn: () => api.get<any[]>(`/dashboard/${userId}/weekly?date=${weekEnd}`),
    enabled: !!userId,
  });

  // Today's meals for current user
  const { data: meals = [], refetch: refetchMeals } = useQuery({
    queryKey: ['meals', userId, date],
    queryFn: () => api.get<Meal[]>(`/meals/user/${userId}?date=${date}`),
    enabled: !!userId,
  });

  // Active workout
  const { data: activeWorkout } = useQuery({
    queryKey: ['active-session', userId],
    queryFn: () => api.get<WorkoutSession | null>(`/workouts/user/${userId}/active`),
    enabled: !!userId,
    refetchInterval: 30_000,
  });

  // Today's completed/in-progress sessions (for DayActivities)
  const { data: dayActivities = [] } = useQuery({
    queryKey: ['workout-history', userId, date],
    queryFn: () => api.get<WorkoutSessionSummary[]>(`/workouts/user/${userId}?date=${date}&limit=20`),
    enabled: !!userId,
  });

  // Routines for start workout
  const { data: routines = [] } = useQuery({
    queryKey: ['routines', userId],
    queryFn: () => api.get<Routine[]>(`/routines/user/${userId}`),
    enabled: !!userId,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['meals', userId, date] });
    qc.invalidateQueries({ queryKey: ['daily-summary', userId, date] });
  };

  const invalidateOther = () => {
    qc.invalidateQueries({ queryKey: ['meals', otherUser?.id, date] });
    qc.invalidateQueries({ queryKey: ['daily-summary', otherUser?.id, date] });
  };

  const deleteMeal = useMutation({
    mutationFn: (id: number) => api.delete(`/meals/${id}`),
    onSuccess: invalidate,
  });

  const deleteItem = useMutation({
    mutationFn: (id: number) => api.delete(`/meals/items/${id}`),
    onSuccess: invalidate,
  });

  const editItem = useMutation({
    mutationFn: ({ itemId, ...data }: { itemId: number; quantity?: number; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; fiber_g?: number; sugar_g?: number }) =>
      api.put(`/meals/items/${itemId}`, data),
    onSuccess: invalidate,
  });

  const updateMeal = useMutation({
    mutationFn: ({ id, meal_type }: { id: number; meal_type: MealType }) =>
      api.put(`/meals/${id}`, { meal_type }),
    onSuccess: invalidate,
  });


  const createMeal = useMutation({
    mutationFn: ({ meal_type, uid }: { meal_type: MealType; uid: number }) =>
      api.post<Meal>('/meals', {
        meal_type, user_id: uid,
        logged_at: date !== fmt(new Date()) ? new Date(`${date}T12:00:00`).toISOString() : undefined,
      }),
    onSuccess: (meal, vars) => {
      if (vars.uid === userId) invalidate(); else invalidateOther();
      setLogMealOpen(false);
      setExpandedMeals(prev => new Set([...prev, meal.id]));
      setFreshMealId(meal.id);
      setAddFoodToMeal({ mealId: meal.id, userId: vars.uid });
    },
  });

  const startSession = useMutation({
    mutationFn: ({ routineId, uid }: { routineId?: number; uid: number }) =>
      api.post<WorkoutSession>('/workouts/start', { user_id: uid, routine_id: routineId }),
    onSuccess: (session, vars) => {
      setSession(session.id, vars.uid);
      qc.invalidateQueries({ queryKey: ['active-session', vars.uid] });
      setStartWorkoutOpen(false);
      navigate(`/workout/live/${session.id}`);
    },
  });

  const startPairSessions = useMutation({
    mutationFn: async ({ routineIds }: { routineIds: Record<number, number | undefined> }) => {
      const [s1, s2] = await Promise.all([
        api.post<WorkoutSession>('/workouts/start', { user_id: users[0]?.id, routine_id: routineIds[users[0]?.id] }),
        api.post<WorkoutSession>('/workouts/start', { user_id: users[1]?.id, routine_id: routineIds[users[1]?.id] }),
      ]);
      return [s1, s2];
    },
    onSuccess: ([s1, s2]) => {
      qc.invalidateQueries({ queryKey: ['active-session'] });
      setStartWorkoutOpen(false);
      // Navigate to forced-landscape split-screen live tracking for both users
      window.location.href = `/?liveSessions=${s1.id},${s2.id}&liveUsers=${s1.user_id},${s2.user_id}`;
    },
  });

  const logActivity = useMutation({
    mutationFn: (data: { name: string; duration_minutes: number; calories_burned: number; date?: string }) =>
      api.post('/workouts/log-manual', { user_id: userId, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-history', userId] });
      qc.invalidateQueries({ queryKey: ['daily-summary', userId, date] });
      setLogActivityOpen(false);
    },
  });

  function shiftDate(delta: number) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setDate(fmt(d));
  }

  // Calorie goal progress: remap server's metabolic labels to goal-progress language.
  //   "maintenance" → "On Target" (ate right at the goal)
  //   "deficit"     → "Under Target" (ate less than the calorie goal)
  //   "surplus"     → "Over Target"  (ate more than the calorie goal)
  const hasEaten = (summary?.meals.calories ?? 0) > 0;
  const c = hasEaten ? summary?.classification : undefined;
  const baseTarget = summary?.targets.calorie_target ?? 0;
  const burnedToday = summary?.exercise.calories_burned ?? 0;
  // Effective target = sedentary base + today's exercise calories
  const effectiveTarget = baseTarget ? baseTarget + burnedToday : 0;
  const eaten = summary ? Math.round(summary.meals.calories) : 0;
  const remaining = effectiveTarget ? effectiveTarget - eaten : null;

  const goalLabel = c === 'maintenance' ? 'On Target'
    : c === 'deficit' ? 'Under Target'
    : c === 'surplus' ? 'Over Target'
    : null;
  const classColor = c === 'surplus' ? 'text-amber-400' : c === 'deficit' ? 'text-sky-400' : c === 'maintenance' ? 'text-green-400' : 'text-gray-400';
  const classIcon = c === 'deficit' ? <TrendingDown size={14} /> : c === 'surplus' ? <TrendingUp size={14} /> : c === 'maintenance' ? <Check size={14} /> : null;

  const activeMealUser = logMealTargetUser ?? userId;

  return (
    <>
    <div
      className="space-y-4"
      style={{ transform: `translateX(${dragX}px)`, transition: swipeTransition ? 'transform 0.2s ease-out' : 'none' }}
      onTouchStart={e => {
        swipeStartX.current = e.touches[0].clientX;
        swipeStartY.current = e.touches[0].clientY;
        setSwipeTransition(false);
      }}
      onTouchMove={e => {
        const dx = e.touches[0].clientX - swipeStartX.current;
        const dy = e.touches[0].clientY - swipeStartY.current;
        if (Math.abs(dy) > Math.abs(dx)) return;
        setDragX(dx < 0 && isToday ? Math.max(dx * 0.15, -25) : dx);
      }}
      onTouchEnd={e => {
        const dx = e.changedTouches[0].clientX - swipeStartX.current;
        const isForward = dx < 0;
        if (Math.abs(dx) > 60 && !(isForward && isToday)) {
          setSwipeTransition(true);
          setDragX(isForward ? -window.innerWidth : window.innerWidth);
          setTimeout(() => {
            shiftDate(isForward ? 1 : -1);
            setSwipeTransition(false);
            setDragX(isForward ? window.innerWidth : -window.innerWidth);
            requestAnimationFrame(() => requestAnimationFrame(() => {
              setSwipeTransition(true);
              setDragX(0);
            }));
          }, 120);
        } else {
          setSwipeTransition(true);
          setDragX(0);
        }
      }}
    >
      {/* Date navigator */}
      <div className="flex items-center justify-between">
        <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">
            {isToday ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          {!isToday && (
            <button onClick={() => setDate(fmt(new Date()))} className="text-xs text-indigo-400 hover:text-indigo-300">
              Back to today
            </button>
          )}
        </div>
        <button onClick={() => shiftDate(1)} disabled={isToday} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* ── Dual-user summary ─────────────────────────────────────────────── */}
      {otherUser && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { u: users.find(u => u.id === userId)!, s: summary, isActive: true },
            { u: otherUser, s: otherSummary, isActive: false },
          ].map(({ u, s, isActive }) => {
            const cardEaten = s ? Math.round(s.meals.calories) : 0;
            const cardBase = s?.targets.calorie_target ?? null;
            const cardBurned = s?.exercise.calories_burned ?? 0;
            const cardEffective = cardBase ? cardBase + cardBurned : null;
            const pct = cardEffective ? Math.min((cardEaten / cardEffective) * 100, 100) : 0;
            const cls = s?.classification;
            const barColor = cls === 'surplus' ? 'bg-amber-500' : cls === 'maintenance' ? 'bg-green-600' : 'bg-gray-500';
            return (
              <button
                key={u?.id}
                onClick={() => { if (!isActive && u) setActiveUserId(u.id); }}
                className={`rounded-xl p-3 border text-left transition-all ${isActive ? 'bg-gray-800 border-indigo-600' : 'bg-gray-900 border-gray-800 hover:border-gray-600'}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-white truncate">{u?.name}</span>
                  {isActive && <span className="text-[10px] text-indigo-400">active</span>}
                </div>
                <p className="text-lg font-bold text-white">{cardEaten}</p>
                <p className="text-[10px] text-gray-500 mb-1.5">{cardEffective ? `/ ${cardEffective} kcal` : 'no target'}</p>
                <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                  <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${pct}%` }} />
                </div>
                {s && (
                  <div className="flex gap-2 mt-1.5 text-[10px] flex-wrap">
                    <span className="text-sky-400">{Math.round(s.meals.protein_g)}P</span>
                    <span className="text-amber-400">{Math.max(0, Math.round(s.meals.carbs_g - s.meals.fiber_g))}NC</span>
                    <span className="text-orange-400">{Math.round(s.meals.fat_g)}F</span>
                    <span className="text-emerald-400">{Math.round(s.meals.fiber_g)}Fib</span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* ── Quick Actions ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setLogMealTargetUser(userId); setLogMealOpen(true); }}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-colors"
        >
          <Utensils size={16} /> Log Meal
        </button>
        {activeWorkout ? (
          <button
            onClick={() => navigate(`/workout/live/${activeWorkout.id}`)}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-colors"
          >
            <Play size={16} /> Resume Workout
          </button>
        ) : (
          <button
            onClick={() => setLogWorkoutPickerOpen(true)}
            className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-white rounded-xl px-4 py-3 text-sm font-semibold transition-colors border border-gray-700"
          >
            <Dumbbell size={16} /> Log Activity
          </button>
        )}
      </div>

      {/* ── Active workout banner ──────────────────────────────────────────── */}
      {activeWorkout && (
        <div className="bg-indigo-950 border border-indigo-800 rounded-2xl p-3.5 flex items-center justify-between">
          <div>
            <p className="text-xs text-indigo-400 font-medium">Workout in progress</p>
            <p className="text-sm font-semibold text-white">{activeWorkout.name}</p>
            <p className="text-xs text-indigo-300 mt-0.5">
              Started {parseSQLiteLocal(activeWorkout.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
            </p>
          </div>
          <Button size="sm" onClick={() => navigate(`/workout/live/${activeWorkout.id}`)} className="bg-indigo-600 hover:bg-indigo-500">
            <Play size={12} /> Resume
          </Button>
        </div>
      )}

      {/* ── Calorie overview ──────────────────────────────────────────────── */}
      {summary && (
        <div className={`bg-gray-900 rounded-2xl p-4 border transition-colors duration-500 ${
          c === 'surplus'     ? 'border-amber-800/50'
          : c === 'maintenance' ? 'border-green-800/50'
          : c === 'deficit'   ? 'border-indigo-800/40'
          : 'border-gray-800'
        }`}>
          <div className="flex items-center gap-4">
            {/* Ring shows eaten vs effective target; arc split by P/C/F calorie contribution */}
            <CalorieRing
              consumed={summary.meals.calories}
              target={effectiveTarget}
              burned={0}
              protein={summary.meals.protein_g}
              carbs={summary.meals.carbs_g}
              fat={summary.meals.fat_g}
            />
            <div className="flex-1 min-w-0 space-y-2">
              {/* Goal status */}
              <div className="flex items-center gap-1.5">
                {classIcon && <span className={classColor}>{classIcon}</span>}
                <span className={`text-base font-bold ${c ? classColor : 'text-gray-500'}`}>
                  {goalLabel ?? (effectiveTarget ? 'No meals yet' : 'No target set')}
                </span>
              </div>
              {/* Remaining / over — prominent */}
              {effectiveTarget > 0 && remaining !== null && (
                <p className={`text-sm font-semibold ${hasEaten ? (remaining >= 0 ? 'text-gray-200' : 'text-amber-400') : 'text-gray-600'}`}>
                  {!hasEaten
                    ? `${effectiveTarget} kcal today`
                    : remaining >= 0
                    ? `${remaining} kcal left`
                    : `${Math.abs(remaining)} kcal over`}
                </p>
              )}
              {/* Workout target breakdown */}
              {burnedToday > 0 && baseTarget > 0 && (
                <p className="text-[11px] text-gray-600">
                  {baseTarget} + {Math.round(burnedToday)} exercise = {effectiveTarget}
                </p>
              )}
              {/* Eaten / burned stats */}
              <div className="flex gap-3 text-xs text-gray-500">
                <span className="flex items-center gap-1">
                  <Flame size={12} className="text-orange-400 shrink-0" />
                  <span className="text-gray-300 font-medium">{Math.round(summary.meals.calories)}</span> eaten
                </span>
                {summary.exercise.calories_burned > 0 && (
                  <span className="flex items-center gap-1">
                    <Dumbbell size={12} className="text-green-400 shrink-0" />
                    <span className="text-gray-300 font-medium">{Math.round(summary.exercise.calories_burned)}</span> burned
                  </span>
                )}
              </div>
              <MacroBar macros={summary.meals} />
              <MacroPills macros={summary.meals} compact />
            </div>
          </div>
        </div>
      )}

      {/* ── Today's meals ─────────────────────────────────────────────────── */}
      <DayMeals
        meals={meals}
        userId={userId}
        date={date}
        expandedMeals={expandedMeals}
        onToggle={(id) => setExpandedMeals(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; })}
        onAddMeal={() => { setLogMealTargetUser(userId); setLogMealOpen(true); }}
        onAddFood={(mealId) => setAddFoodToMeal({ mealId, userId })}
        onDeleteMeal={(id) => deleteMeal.mutate(id)}
        onDeleteItem={(id) => deleteItem.mutate(id)}
        onEditItem={(id, data) => editItem.mutate({ itemId: id, ...data })}
        onEditMeal={(id, meal_type) => updateMeal.mutate({ id, meal_type })}
      />

      {/* ── Today's activities ────────────────────────────────────────────── */}
      <DayActivities
        sessions={dayActivities}
        date={date}
        onLogActivity={() => setLogWorkoutPickerOpen(true)}
        onViewSession={setViewSessionId}
      />


      {/* ── Macro targets — dynamic based on user's tracked_macros setting ── */}
      {summary && (() => {
        const trackedKeys: string[] = summary.targets.tracked_macros?.length
          ? summary.targets.tracked_macros
          : [...DEFAULT_TRACKED_MACROS];
        const macrosInTracked = MACRO_CONFIG.filter(m => trackedKeys.includes(m.key));
        const hasAnyTarget = macrosInTracked.some(m => m.targetKey && (summary.targets as any)[m.targetKey] != null);
        return (
          <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-gray-400">Macros Today</h2>
              {!hasAnyTarget && (
                <button onClick={() => navigate('/profile')} className="text-[11px] text-indigo-400 hover:text-indigo-300">
                  Set targets →
                </button>
              )}
            </div>
            <div className="space-y-2">
              {macrosInTracked.map(macro => {
                // Net Carbs = total carbs − fiber; target = carbs_target − fiber_target
                const rawVal = (summary.meals as any)[macro.key] ?? 0;
                const val = macro.key === 'carbs_g'
                  ? Math.max(0, rawVal - (summary.meals.fiber_g ?? 0))
                  : rawVal;
                const rawTarget = macro.targetKey ? (summary.targets as any)[macro.targetKey] : null;
                const target = macro.key === 'carbs_g' && rawTarget != null
                  ? Math.max(0, rawTarget - (summary.targets.fiber_target_g ?? 0)) || null
                  : rawTarget;
                return (
                  <div key={macro.key} className="space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-400 flex flex-col leading-tight">
                        {macro.label}
                        {macro.sublabel && <span className="text-gray-600 text-[10px]">{macro.sublabel}</span>}
                      </span>
                      <span className="text-white font-medium">
                        {Math.round(val)}{macro.unit}
                        {target != null && <span className="text-gray-500"> / {target}{macro.unit}</span>}
                      </span>
                    </div>
                    {target != null ? (
                      <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min((val / (target || 1)) * 100, 100)}%`,
                            backgroundColor: macro.color,
                          }}
                        />
                      </div>
                    ) : (
                      <div className="h-1.5 bg-gray-800 rounded-full" />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Weekly chart ──────────────────────────────────────────────────── */}
      {weekly && weekly.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={weekly} barSize={24}>
              <XAxis dataKey="date" tickFormatter={d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip content={<WeeklyTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="calories_in" radius={[4,4,0,0]}>
                {weekly.map((d, i) => (
                  <Cell key={i} fill={
                    d.classification === 'surplus' ? '#f59e0b'
                    : d.classification === 'maintenance' ? '#22c55e'
                    : '#6b7280'
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {/* Colorblind-safe: gray/indigo/amber (not red/green) plus shape, not just color */}
          <div className="flex gap-3 justify-center mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-500" /> Under</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-green-500" /> On Target</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rotate-45 inline-block bg-amber-500" /> Over</span>
          </div>
        </div>
      )}

    </div>

      {/* ── Log Meal Modal ─────────────────────────────────────────────────── */}
      {logMealOpen && (
        <LogMealModal
          open
          userId={activeMealUser!}
          userName={users.find(u => u.id === activeMealUser)?.name}
          otherUser={otherUser}
          onClose={() => setLogMealOpen(false)}
          onCreate={(type, uid) => createMeal.mutate({ meal_type: type, uid })}
          loading={createMeal.isPending}
        />
      )}

      {/* ── Add Food to Meal Modal ─────────────────────────────────────────── */}
      {addFoodToMeal && (
        <AddFoodModal
          open
          mealId={addFoodToMeal.mealId}
          userId={addFoodToMeal.userId}
          onClose={() => {
            // Delete the meal if user created it but never added food
            if (freshMealId === addFoodToMeal.mealId) {
              const targetUserId = addFoodToMeal.userId;
              api.delete(`/meals/${freshMealId}`).then(() => {
                if (targetUserId === userId) invalidate(); else invalidateOther();
              });
              setFreshMealId(null);
            }
            setAddFoodToMeal(null);
          }}
          onAdded={() => {
            setFreshMealId(null); // food was added — meal is no longer empty
            if (addFoodToMeal.userId === userId) invalidate();
            else invalidateOther();
          }}
        />
      )}

      {/* ── Log Workout Picker ─────────────────────────────────────────────── */}
      {logWorkoutPickerOpen && (
        <LogWorkoutPickerModal
          open
          onClose={() => setLogWorkoutPickerOpen(false)}
          onLogActivity={() => { setLogWorkoutPickerOpen(false); setLogActivityOpen(true); }}
          onStartTracked={() => { setLogWorkoutPickerOpen(false); setStartWorkoutOpen(true); }}
        />
      )}

      {/* ── Log Activity Modal ─────────────────────────────────────────────── */}
      {logActivityOpen && (
        <LogActivityModal
          open
          onClose={() => setLogActivityOpen(false)}
          onSave={(data) => logActivity.mutate(data)}
          loading={logActivity.isPending}
        />
      )}

      {/* ── Session detail / edit modal ────────────────────────────────────── */}
      {viewSessionId && (
        <SessionDetailModal
          sessionId={viewSessionId}
          userId={userId!}
          onClose={() => setViewSessionId(null)}
        />
      )}

      {/* ── Start Workout Modal ────────────────────────────────────────────── */}
      {startWorkoutOpen && (
        <StartWorkoutModal
          open
          users={users}
          userId={userId}
          onClose={() => setStartWorkoutOpen(false)}
          onStart={(routineId, uid) => startSession.mutate({ routineId, uid: uid ?? userId! })}
          onStartPair={(routineIds) => startPairSessions.mutate({ routineIds })}
          loading={startSession.isPending || startPairSessions.isPending}
        />
      )}
    </>
  );
}

// ─── DayMeals: today's meal list embedded in dashboard ───────────────────────

function DayMeals({ meals, userId, date, expandedMeals, onToggle, onAddMeal, onAddFood, onDeleteMeal, onDeleteItem, onEditItem, onEditMeal }: {
  meals: Meal[]; userId: number; date: string;
  expandedMeals: Set<number>;
  onToggle: (id: number) => void;
  onAddMeal: () => void;
  onAddFood: (mealId: number) => void;
  onDeleteMeal: (id: number) => void;
  onDeleteItem: (id: number) => void;
  onEditItem: (id: number, data: { quantity?: number; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; fiber_g?: number; sugar_g?: number }) => void;
  onEditMeal: (id: number, meal_type: MealType) => void;
}) {
  const [show, setShow] = useState(true);

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      <button
        onClick={() => setShow(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-white">
          {date === fmt(new Date()) ? "Today's Meals" : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{meals.length} meal{meals.length !== 1 ? 's' : ''}</span>
          {show ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </button>

      {show && (
        <div className="border-t border-gray-800">
          {meals.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-600 italic">No meals logged yet.</p>
          )}
          {meals.map(meal => (
            <MealRow
              key={meal.id}
              meal={meal}
              expanded={expandedMeals.has(meal.id)}
              onToggle={() => onToggle(meal.id)}
              onAddFood={() => onAddFood(meal.id)}
              onDelete={() => onDeleteMeal(meal.id)}
              onDeleteItem={onDeleteItem}
              onEditItem={onEditItem}
              onEditMealType={(t) => onEditMeal(meal.id, t)}
            />
          ))}
          <div className="px-4 py-2.5 border-t border-gray-800/50">
            <button
              onClick={onAddMeal}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 py-1 transition-colors"
            >
              <Plus size={12} /> Add Meal
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SessionDetailModal ───────────────────────────────────────────────────────

function SessionDetailModal({ sessionId, userId, onClose }: { sessionId: number; userId: number; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: session, refetch } = useQuery({
    queryKey: ['session-detail-dash', sessionId],
    queryFn: () => api.get<WorkoutSession>(`/workouts/${sessionId}`),
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editReps, setEditReps] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editWeightUnit, setEditWeightUnit] = useState('lb');
  const [editDuration, setEditDuration] = useState('');

  const deleteSession = useMutation({
    mutationFn: () => api.delete(`/workouts/${sessionId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-history', userId] });
      qc.invalidateQueries({ queryKey: ['daily-summary', userId] });
      qc.invalidateQueries({ queryKey: ['active-session', userId] });
      onClose();
    },
  });

  const updateSet = useMutation({
    mutationFn: ({ setId, reps, duration, weight, weightUnit }: { setId: number; reps?: number; duration?: number; weight?: number; weightUnit: string }) =>
      api.put(`/workouts/sets/${setId}`, {
        actual_reps: reps,
        actual_duration_seconds: duration,
        actual_weight_value: weight,
        actual_weight_unit: weightUnit,
      }),
    onSuccess: () => {
      refetch();
      qc.invalidateQueries({ queryKey: ['pbs', userId] });
      setEditingSetId(null);
    },
  });

  const dur = session?.completed_at
    ? Math.max(0, Math.round((parseSQLiteLocal(session.completed_at).getTime() - parseSQLiteLocal(session.started_at).getTime()) / 1000))
    : 0;

  function fmtSecs(s: number) {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return m > 0 ? `${m}m ${sec}s` : `${sec}s`;
  }

  const loggedExercises = session?.exercises?.filter(ex => ex.sets && ex.sets.length > 0) ?? [];

  return (
    <Modal open onClose={onClose} title={session?.name ?? 'Workout'} size="md">
      {!session ? (
        <p className="text-sm text-gray-500 text-center py-4">Loading…</p>
      ) : (
        <div className="space-y-4">
          {/* Summary row */}
          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {parseSQLiteLocal(session.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
            {dur > 0 && <span className="flex items-center gap-1"><Clock size={11} />{fmtSecs(dur)}</span>}
            {(session.calories_burned ?? 0) > 0 && (
              <span className="flex items-center gap-1 text-emerald-400"><Flame size={11} />{Math.round(session.calories_burned!)} kcal</span>
            )}
            {session.status === 'abandoned' && (
              <span className="px-1.5 py-0.5 bg-gray-800 text-gray-500 rounded-full">abandoned</span>
            )}
          </div>

          {/* Exercises */}
          {loggedExercises.length > 0 ? (() => {
            const ZONE_META: Record<string, { label: string; color: string }> = {
              warmup:   { label: 'Warm-Up',   color: 'text-amber-400' },
              workout:  { label: 'Workout',   color: 'text-indigo-400' },
              cooldown: { label: 'Cool-Down', color: 'text-cyan-400' },
            };
            const zoneOf = (cat?: string) => cat === 'warmup' ? 'warmup' : cat === 'cooldown' ? 'cooldown' : 'workout';
            let lastZone = '';
            return (
            <div className="space-y-2">
              {loggedExercises.map((ex: any) => {
                const zone = zoneOf(ex.category);
                const showHeader = zone !== lastZone;
                lastZone = zone;
                const zm = ZONE_META[zone];
                const isTimed = ex.exercise_type === 'timed';
                return (
                  <div key={ex.id}>
                  {showHeader && (
                    <p className={`text-[9px] font-bold uppercase tracking-widest pt-1 pb-0.5 ${zm.color}`}>{zm.label}</p>
                  )}
                  <div className="bg-gray-800 rounded-xl p-3 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      {isTimed
                        ? <Timer size={11} className="text-purple-400 shrink-0" />
                        : <Dumbbell size={11} className="text-blue-400 shrink-0" />}
                      <p className="text-xs font-semibold text-white">{ex.exercise_name}</p>
                      <span className="ml-auto text-[10px] text-gray-600">{ex.sets.length} sets</span>
                    </div>
                    {ex.sets.map((set: any) => (
                      <div key={set.id} className="flex items-center gap-2 pl-4">
                        {editingSetId === set.id ? (
                          <>
                            <span className="text-[10px] text-gray-600 w-6 shrink-0">#{set.set_number}</span>
                            {isTimed ? (
                              <Input type="number" value={editDuration} onChange={e => setEditDuration(e.target.value)} suffix="s" className="flex-1" />
                            ) : (
                              <>
                                <Input type="number" value={editReps} onChange={e => setEditReps(e.target.value)} placeholder="Reps" className="w-16" />
                                <Input type="number" value={editWeight} onChange={e => setEditWeight(e.target.value)} placeholder="Wt" className="w-16" />
                                <Select value={editWeightUnit} onChange={e => setEditWeightUnit(e.target.value)}
                                  options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} className="w-16" />
                              </>
                            )}
                            <button
                              onClick={() => updateSet.mutate({
                                setId: set.id,
                                reps: isTimed ? undefined : (parseInt(editReps) || undefined),
                                duration: isTimed ? (parseFloat(editDuration) || undefined) : undefined,
                                weight: editWeight ? parseFloat(editWeight) : undefined,
                                weightUnit: editWeightUnit,
                              })}
                              disabled={updateSet.isPending}
                              className="p-1 text-green-400 hover:text-green-300"
                            >
                              <Check size={13} />
                            </button>
                            <button onClick={() => setEditingSetId(null)} className="p-1 text-gray-500 hover:text-white">
                              <X size={13} />
                            </button>
                          </>
                        ) : (
                          <>
                            <span className="text-[10px] text-gray-600 w-6 shrink-0">#{set.set_number}</span>
                            <span className="text-xs text-white">
                              {isTimed
                                ? `${set.actual_duration_seconds}s`
                                : `${set.actual_reps} × ${set.actual_weight_value ?? 0}${set.actual_weight_unit}`}
                            </span>
                            {set.is_pb === 1 && <span className="text-[10px] font-bold text-yellow-400">PR</span>}
                            {set.is_pb === 2 && <span className="text-[10px] font-bold text-gray-500">=PR</span>}
                            <button
                              onClick={() => {
                                setEditingSetId(set.id);
                                setEditReps(String(set.actual_reps ?? ''));
                                setEditWeight(String(set.actual_weight_value ?? ''));
                                setEditWeightUnit(set.actual_weight_unit ?? 'lb');
                                setEditDuration(String(set.actual_duration_seconds ?? ''));
                              }}
                              className="ml-auto p-1 text-gray-600 hover:text-indigo-400 transition-colors"
                            >
                              <Pencil size={11} />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  </div>
                );
              })}
            </div>
            );
          })() : (
            <p className="text-xs text-gray-600 italic text-center py-2">No sets logged for this session.</p>
          )}

          {/* Delete */}
          <div className="pt-2 border-t border-gray-800">
            {confirmDelete ? (
              <div className="flex gap-2">
                <Button variant="secondary" onClick={() => setConfirmDelete(false)} className="flex-1">Cancel</Button>
                <Button
                  onClick={() => deleteSession.mutate()}
                  disabled={deleteSession.isPending}
                  className="flex-1 bg-red-700 hover:bg-red-600"
                >
                  {deleteSession.isPending ? 'Deleting…' : 'Confirm Delete'}
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmDelete(true)}
                className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-400 transition-colors"
              >
                <Trash2 size={12} /> Delete Workout
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── DayActivities: today's workout sessions embedded in dashboard ────────────

function fmtDuration(startedAt: string, completedAt?: string) {
  if (!completedAt) return null;
  const mins = Math.round(
    (parseSQLiteLocal(completedAt).getTime() - parseSQLiteLocal(startedAt).getTime()) / 60000
  );
  if (mins < 1) return null;
  return mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function DayActivities({ sessions, date, onLogActivity, onViewSession }: {
  sessions: WorkoutSessionSummary[];
  date: string;
  onLogActivity: () => void;
  onViewSession: (id: number) => void;
}) {
  const navigate = useNavigate();
  const [show, setShow] = useState(true);
  const completed = sessions.filter(s => s.status !== 'abandoned');

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
      <button
        onClick={() => setShow(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left"
      >
        <span className="text-sm font-semibold text-white">
          {date === fmt(new Date()) ? "Today's Activities" : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' Activities'}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">{completed.length} session{completed.length !== 1 ? 's' : ''}</span>
          {show ? <ChevronUp size={14} className="text-gray-500" /> : <ChevronDown size={14} className="text-gray-500" />}
        </div>
      </button>

      {show && (
        <div className="border-t border-gray-800">
          {completed.length === 0 && (
            <p className="px-4 py-3 text-xs text-gray-600 italic">No activities logged yet.</p>
          )}
          {completed.map(session => {
            const time = parseSQLiteLocal(session.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
            const duration = fmtDuration(session.started_at, session.completed_at);
            return (
              <button
                key={session.id}
                onClick={() => session.status === 'in_progress'
                  ? navigate(`/workout/live/${session.id}`)
                  : onViewSession(session.id)
                }
                className="w-full flex items-center justify-between px-4 py-2.5 border-b border-gray-800/50 last:border-0 text-left hover:bg-gray-800/40 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Dumbbell size={14} className="text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-white truncate">{session.name}</p>
                    <div className="flex items-center gap-2 text-[10px] text-gray-500 mt-0.5">
                      <span className="flex items-center gap-0.5"><Clock size={9} />{time}</span>
                      {duration && <span>{duration}</span>}
                      {session.exercise_count > 0 && (
                        <span>{session.exercise_count} exercise{session.exercise_count !== 1 ? 's' : ''}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                  {session.status === 'in_progress' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-800/50">Live</span>
                  )}
                  {(session.calories_burned ?? 0) > 0 && (
                    <span className="text-xs font-medium text-emerald-400">{Math.round(session.calories_burned!)} kcal</span>
                  )}
                </div>
              </button>
            );
          })}
          <div className="px-4 py-2.5 border-t border-gray-800/50">
            <button
              onClick={onLogActivity}
              className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 py-1 transition-colors"
            >
              <Plus size={12} /> Log Activity
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

type MealItemEdit = { quantity?: number; calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; fiber_g?: number; sugar_g?: number };

function MealRow({ meal, expanded, onToggle, onAddFood, onDelete, onDeleteItem, onEditItem, onEditMealType }: {
  meal: Meal; expanded: boolean;
  onToggle: () => void; onAddFood: () => void; onDelete: () => void;
  onDeleteItem: (id: number) => void;
  onEditItem: (id: number, data: MealItemEdit) => void;
  onEditMealType: (t: MealType) => void;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editingType, setEditingType] = useState(false);
  const label = MEAL_LABELS[meal.meal_type] ?? meal.meal_type;
  const time = parseSQLiteLocal(meal.logged_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <div className="border-b border-gray-800/50 last:border-0">
      <div onClick={onToggle} className="w-full flex items-center justify-between px-4 py-2.5 text-left cursor-pointer select-none">
        <div className="flex items-center gap-2 min-w-0">
          {editingType ? (
            <select
              className="text-xs bg-gray-800 text-white border border-gray-700 rounded px-1 py-0.5 focus:outline-none focus:border-indigo-500"
              value={meal.meal_type}
              onClick={e => e.stopPropagation()}
              onChange={e => { onEditMealType(e.target.value as MealType); setEditingType(false); }}
              onBlur={() => setEditingType(false)}
              autoFocus
            >
              {MEAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          ) : (
            <button
              onClick={e => { e.stopPropagation(); setEditingType(true); }}
              className="text-xs font-medium text-white hover:text-indigo-400 transition-colors"
              title="Tap to change meal type"
            >{label}</button>
          )}
          <span className="text-[10px] text-gray-600 flex items-center gap-0.5"><Clock size={9} />{time}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-xs text-white font-medium">{Math.round(meal.totals.calories)} kcal</span>
          {expanded ? <ChevronUp size={12} className="text-gray-500" /> : <ChevronDown size={12} className="text-gray-500" />}
        </div>
      </div>
      {expanded && (
        <div className="px-4 pb-2.5 space-y-1">
          {meal.items.length === 0 && <p className="text-[11px] text-gray-600 italic py-1">No items yet.</p>}
          {meal.items.map(item => (
            <DashboardItemRow
              key={item.id}
              item={item}
              onDelete={() => onDeleteItem(item.id)}
              onEdit={(data) => onEditItem(item.id, data)}
            />
          ))}
          <div className="pt-1 pb-2">
            <MacroBreakdown macros={meal.totals} />
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button onClick={onAddFood} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
              <Plus size={11} /> Add food
            </button>
            {confirmDelete ? (
              <div className="flex items-center gap-1.5 ml-auto">
                <span className="text-[10px] text-gray-400">Remove?</span>
                <button onClick={() => { onDelete(); setConfirmDelete(false); }}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors">
                  Yes
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors">
                  No
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="text-xs text-gray-600 hover:text-red-400 flex items-center gap-1 ml-auto">
                <Trash2 size={11} /> Delete meal
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

type FoodIngredient = {
  id: number; food_id: number; ingredient_food_id: number; quantity: number;
  name: string; brand?: string; serving_size: number; serving_unit: string;
  calories: number; protein_g: number; carbs_g: number; fat_g: number;
  fiber_g: number; sugar_g: number;
};
type IngredMacros = { calories: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number; sugar_g: number };

function DashIngredientBreakdown({ foodId, onMacrosChanged }: {
  foodId: number; onMacrosChanged: (macros: IngredMacros) => void;
}) {
  const [ingredients, setIngredients] = useState<FoodIngredient[] | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editQty, setEditQty] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get<FoodIngredient[]>(`/foods/${foodId}/ingredients`).then(setIngredients);
  }, [foodId]);

  function startEdit(ingred: FoodIngredient) {
    setEditingId(ingred.id); setEditQty(String(ingred.quantity)); setEditUnit(ingred.serving_unit);
  }
  function handleUnitChange(newUnit: string) {
    const q = parseFloat(editQty);
    if (!isNaN(q)) setEditQty(String(convertToServingUnit(q, editUnit, newUnit)));
    setEditUnit(newUnit);
  }
  async function saveIngredient(ingred: FoodIngredient) {
    const rawQty = parseFloat(editQty);
    if (isNaN(rawQty) || rawQty <= 0) return;
    const newQty = editUnit !== ingred.serving_unit ? convertToServingUnit(rawQty, editUnit, ingred.serving_unit) : rawQty;
    setSaving(true);
    try {
      await api.put(`/foods/ingredients/${ingred.id}`, { quantity: newQty });
      const updated = ingredients!.map(i => i.id === ingred.id ? { ...i, quantity: newQty } : i);
      setIngredients(updated); setEditingId(null);
      const totals = updated.reduce((acc, i) => {
        const s = i.quantity / i.serving_size;
        return { calories: acc.calories + i.calories * s, protein_g: acc.protein_g + i.protein_g * s,
          carbs_g: acc.carbs_g + i.carbs_g * s, fat_g: acc.fat_g + i.fat_g * s,
          fiber_g: acc.fiber_g + i.fiber_g * s, sugar_g: acc.sugar_g + i.sugar_g * s };
      }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 });
      const rounded: IngredMacros = {
        calories: Math.round(totals.calories), protein_g: Math.round(totals.protein_g),
        carbs_g: Math.round(totals.carbs_g), fat_g: Math.round(totals.fat_g),
        fiber_g: Math.round(totals.fiber_g), sugar_g: Math.round(totals.sugar_g),
      };
      await api.put(`/foods/${foodId}`, rounded);
      onMacrosChanged(rounded);
    } finally { setSaving(false); }
  }

  if (ingredients === null) return <div className="px-2 py-1 text-[10px] text-gray-500 italic">Loading…</div>;
  if (ingredients.length === 0) return <div className="px-2 py-1 text-[10px] text-gray-600 italic">No breakdown saved</div>;
  return (
    <div className="px-2 pb-2 space-y-1">
      <p className="text-[9px] text-gray-600 pt-0.5 uppercase tracking-wider">Ingredients</p>
      {ingredients.map(ingred => {
        const scale = ingred.quantity / ingred.serving_size;
        const isEditing = editingId === ingred.id;
        return (
          <div key={ingred.id} className="flex items-center gap-1 group/ingred">
            <span className="text-[10px] text-gray-400 flex-1 truncate">{ingred.name}</span>
            {isEditing ? (
              <>
                <input type="number" value={editQty} onChange={e => setEditQty(e.target.value)} autoFocus
                  className="w-12 bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-white focus:border-indigo-500 outline-none" />
                {MASS_VOL_UNITS.includes(ingred.serving_unit) ? (
                  <select value={editUnit} onChange={e => handleUnitChange(e.target.value)}
                    className="bg-gray-800 border border-gray-700 rounded px-0.5 py-0.5 text-[9px] text-gray-300 focus:border-indigo-500 outline-none">
                    {MASS_VOL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                ) : (
                  <span className="text-[9px] text-gray-500">{ingred.serving_unit}</span>
                )}
                <button onClick={() => saveIngredient(ingred)} disabled={saving}
                  className="p-0.5 text-indigo-400 hover:text-indigo-300 disabled:opacity-50"><Check size={9} /></button>
                <button onClick={() => setEditingId(null)}
                  className="p-0.5 text-gray-600 hover:text-gray-400"><X size={9} /></button>
              </>
            ) : (
              <>
                <span className="text-[9px] text-gray-500 shrink-0">
                  {ingred.quantity % 1 === 0 ? ingred.quantity : ingred.quantity.toFixed(1)}{ingred.serving_unit} · {Math.round(ingred.calories * scale)}kcal
                </span>
                <button onClick={() => startEdit(ingred)}
                  className="p-0.5 text-gray-700 hover:text-indigo-400 opacity-0 group-hover/ingred:opacity-100 transition-opacity">
                  <Pencil size={9} />
                </button>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

function DashboardItemRow({ item, onDelete, onEdit }: {
  item: import('../types').MealItem;
  onDelete: () => void;
  onEdit: (data: MealItemEdit) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showIngredients, setShowIngredients] = useState(false);
  const [editUnit, setEditUnit] = useState(item.serving_unit);
  const [form, setForm] = useState({
    quantity: String(item.quantity),
    calories: String(Math.round(item.calories)),
    protein_g: String(Math.round(item.protein_g)),
    carbs_g: String(Math.round(item.carbs_g)),
    fat_g: String(Math.round(item.fat_g)),
    fiber_g: String(Math.round(item.fiber_g ?? 0)),
    sugar_g: String(Math.round(item.sugar_g ?? 0)),
  });

  function startEdit() {
    setEditUnit(item.serving_unit);
    setForm({
      quantity: String(item.quantity),
      calories: String(Math.round(item.calories)),
      protein_g: String(Math.round(item.protein_g)),
      carbs_g: String(Math.round(item.carbs_g)),
      fat_g: String(Math.round(item.fat_g)),
      fiber_g: String(Math.round(item.fiber_g ?? 0)),
      sugar_g: String(Math.round(item.sugar_g ?? 0)),
    });
    setEditing(true);
  }

  function handleUnitChange(newUnit: string) {
    const currentQty = parseFloat(form.quantity);
    if (!isNaN(currentQty)) {
      setForm(f => ({ ...f, quantity: String(convertToServingUnit(currentQty, editUnit, newUnit)) }));
    }
    setEditUnit(newUnit);
  }

  function save() {
    const rawQty = parseFloat(form.quantity);
    const qty = editUnit !== item.serving_unit
      ? convertToServingUnit(rawQty, editUnit, item.serving_unit)
      : rawQty;
    const data: MealItemEdit = {};
    if (!isNaN(qty) && qty > 0 && qty !== item.quantity) data.quantity = qty;
    const macroFields: (keyof MealItemEdit)[] = ['calories', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g'];
    for (const f of macroFields) {
      const n = parseFloat(form[f as keyof typeof form]);
      const current = Math.round((item as any)[f] ?? 0);
      if (!isNaN(n) && n !== current) (data as any)[f] = n;
    }
    if (Object.keys(data).length > 0) onEdit(data);
    setEditing(false);
  }

  const setF = (k: keyof typeof form) => (e: ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  if (editing) {
    return (
      <div className="py-2 space-y-2 bg-gray-800/40 rounded-lg px-2 -mx-2">
        <span className="text-xs text-white truncate block">{item.food_name}</span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-500 w-12 shrink-0">Qty</span>
          <input type="number" value={form.quantity} onChange={setF('quantity')} autoFocus
            className="w-16 bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-xs text-white focus:border-indigo-500 outline-none" />
          {MASS_VOL_UNITS.includes(item.serving_unit) ? (
            <select value={editUnit} onChange={e => handleUnitChange(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded px-1 py-0.5 text-[10px] text-gray-300 focus:border-indigo-500 outline-none">
              {MASS_VOL_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          ) : (
            <span className="text-[10px] text-gray-500">{item.serving_unit}</span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1">
          {([
            ['calories', 'Cal'], ['protein_g', 'Pro'], ['carbs_g', 'Carb'],
            ['fat_g', 'Fat'], ['fiber_g', 'Fiber'], ['sugar_g', 'Sugar'],
          ] as const).map(([key, label]) => (
            <div key={key}>
              <label className="text-[9px] text-gray-500 block">{label}</label>
              <input type="number" value={form[key]} onChange={setF(key)}
                className="w-full bg-gray-800 border border-gray-700 rounded px-1.5 py-0.5 text-[11px] text-white focus:border-indigo-500 outline-none" />
            </div>
          ))}
        </div>
        <div className="flex gap-1.5 pt-0.5">
          <button onClick={() => setEditing(false)} className="flex-1 text-[11px] px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors">Cancel</button>
          <button onClick={save} className="flex-1 text-[11px] px-2 py-1 rounded bg-indigo-600 text-white hover:bg-indigo-500 transition-colors">Save</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between text-xs text-gray-400 py-0.5 group">
        <span className="truncate flex-1">{item.food_name}</span>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          {confirmDelete ? (
            <>
              <button onClick={() => { onDelete(); setConfirmDelete(false); }}
                className="text-[10px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors">
                Del
              </button>
              <button onClick={() => setConfirmDelete(false)}
                className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors">
                No
              </button>
            </>
          ) : (
            <>
              <span>{item.quantity} {item.serving_unit} · {Math.round(item.calories)} kcal</span>
              {item.brand === 'Quick Entry' && (
                <button onClick={() => setShowIngredients(s => !s)}
                  className="text-gray-600 hover:text-indigo-400 p-0.5 transition-colors"
                  title={showIngredients ? 'Hide ingredients' : 'Show ingredients'}>
                  {showIngredients ? <ChevronUp size={10} /> : <ChevronDown size={10} />}
                </button>
              )}
              <button onClick={startEdit} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-indigo-400 p-0.5 transition-opacity">
                <Pencil size={10} />
              </button>
              <button onClick={() => setConfirmDelete(true)} className="opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 p-0.5 transition-opacity">
                <Trash2 size={10} />
              </button>
            </>
          )}
        </div>
      </div>
      {showIngredients && (
        <DashIngredientBreakdown
          foodId={item.food_id}
          onMacrosChanged={(macros) => onEdit(macros)}
        />
      )}
    </div>
  );
}

// ─── Log Meal Modal ───────────────────────────────────────────────────────────

function LogMealModal({ open, userId, userName, otherUser, onClose, onCreate, loading }: {
  open: boolean; userId: number; userName?: string; otherUser?: { id: number; name: string };
  onClose: () => void; onCreate: (type: MealType, uid: number) => void; loading: boolean;
}) {
  const [type, setType] = useState<MealType>(getDefaultMealType);
  const [targetUid, setTargetUid] = useState(userId);

  return (
    <Modal open={open} onClose={onClose} title="Log Meal" size="sm">
      <div className="space-y-4">
        {otherUser && (
          <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
            <button
              onClick={() => setTargetUid(userId)}
              className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${targetUid === userId ? 'bg-gray-700 text-white' : 'text-gray-500'}`}
            >
              {userName ?? 'Me'}
            </button>
            <button
              onClick={() => setTargetUid(otherUser.id)}
              className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${targetUid === otherUser.id ? 'bg-gray-700 text-white' : 'text-gray-500'}`}
            >
              {otherUser.name}
            </button>
          </div>
        )}
        <Select label="Meal type" value={type} onChange={e => setType(e.target.value as MealType)} options={MEAL_TYPES} />
        <Button onClick={() => onCreate(type, targetUid)} disabled={loading} className="w-full">
          {loading ? 'Adding…' : 'Add Meal'}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Add Food Modal ───────────────────────────────────────────────────────────

interface RecentItem {
  item_id: number;
  food_id: number;
  food_name: string;
  quantity: number;
  serving_size: number;
  serving_unit: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  fiber_g: number;
  meal_type: string;
  meal_date: string;
  logged_by_user_id: number;
  logged_by_name: string;
  is_mine: boolean;
}

function AddFoodModal({ open, mealId, userId, onClose, onAdded }: {
  open: boolean; mealId: number; userId: number; onClose: () => void; onAdded: () => void;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Food | null>(null);
  const [quantity, setQuantity] = useState('');
  const [unit, setUnit] = useState('');
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [createFoodTarget, setCreateFoodTarget] = useState<'main' | 'ingredient'>('main');
  const [createForm, setCreateForm] = useState<Partial<Food>>({
    name: '', serving_size: 100, serving_unit: 'g',
    calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0,
  });

  // Quick log state
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [quickTab, setQuickTab] = useState<'macros' | 'ingredients'>('macros');
  const [quickMacros, setQuickMacros] = useState({ name: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 });
  const [ingredSearch, setIngredSearch] = useState('');
  const [ingredList, setIngredList] = useState<{ food: Food; quantity: number; unit: string }[]>([]);
  const [ingredMealName, setIngredMealName] = useState('');

  const { data: foods = [] } = useQuery({
    queryKey: ['foods', search],
    queryFn: () => api.get<Food[]>(`/foods?search=${encodeURIComponent(search)}&limit=20`),
    enabled: search.length >= 1,
  });

  const { data: recentItems = [] } = useQuery({
    queryKey: ['recent-items', userId],
    queryFn: () => api.get<RecentItem[]>(`/meals/user/${userId}/recent-items?limit=30`),
    staleTime: 60_000,
  });

  const addRecentItem = useMutation({
    mutationFn: (item: RecentItem) =>
      api.post(`/meals/${mealId}/items`, { food_id: item.food_id, quantity: item.quantity }),
    onSuccess: (_, item) => {
      onAdded();
      setLastAdded(item.food_name);
    },
  });

  const { data: ingredFoods = [] } = useQuery({
    queryKey: ['foods', ingredSearch],
    queryFn: () => api.get<Food[]>(`/foods?search=${encodeURIComponent(ingredSearch)}&limit=20`),
    enabled: ingredSearch.length >= 1 && showQuickLog && quickTab === 'ingredients',
  });

  const addItem = useMutation({
    mutationFn: () => api.post(`/meals/${mealId}/items`, {
      food_id: selected!.id,
      quantity: convertToServingUnit(parseFloat(quantity), unit || selected!.serving_unit, selected!.serving_unit),
    }),
    onSuccess: () => {
      onAdded();
      setLastAdded(selected!.name);
      setSelected(null);
      setQuantity('');
      setUnit('');
      // intentionally keep `search` so user stays in same restaurant context
    },
  });

  const createFood = useMutation({
    mutationFn: (data: Partial<Food>) => api.post<Food>('/foods', data),
    onSuccess: (food) => {
      qc.invalidateQueries({ queryKey: ['foods'] });
      if (createFoodTarget === 'ingredient') {
        setIngredList(l => [...l, { food, quantity: food.serving_size, unit: food.serving_unit }]);
        setIngredSearch('');
      } else {
        setSelected(food);
      }
      setShowCreate(false);
    },
  });

  const quickLogMacros = useMutation({
    mutationFn: async () => {
      const food = await api.post<Food>('/foods', {
        name: quickMacros.name.trim() || 'Quick entry',
        brand: 'Quick Entry',
        serving_size: 1, serving_unit: 'serving',
        calories: quickMacros.calories,
        protein_g: quickMacros.protein_g,
        carbs_g: quickMacros.carbs_g,
        fat_g: quickMacros.fat_g,
        fiber_g: quickMacros.fiber_g,
        sugar_g: quickMacros.sugar_g,
      });
      await api.post(`/meals/${mealId}/items`, { food_id: food.id, quantity: 1 });
    },
    onSuccess: () => {
      onAdded();
      setLastAdded(quickMacros.name.trim() || 'Quick entry');
      setShowQuickLog(false);
      setQuickMacros({ name: '', calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 });
    },
  });

  const quickLogIngredients = useMutation({
    mutationFn: async () => {
      const name = ingredMealName.trim() || 'Mixed Ingredients';
      const totals = ingredList.reduce((acc, { food, quantity: qty, unit: u }) => {
        const scale = convertToServingUnit(qty, u || food.serving_unit, food.serving_unit) / food.serving_size;
        return {
          calories: acc.calories + food.calories * scale,
          protein_g: acc.protein_g + food.protein_g * scale,
          carbs_g: acc.carbs_g + food.carbs_g * scale,
          fat_g: acc.fat_g + food.fat_g * scale,
          fiber_g: acc.fiber_g + (food.fiber_g || 0) * scale,
          sugar_g: acc.sugar_g + (food.sugar_g || 0) * scale,
        };
      }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0, sugar_g: 0 });
      const food = await api.post<Food>('/foods', {
        name, brand: 'Quick Entry', serving_size: 1, serving_unit: 'serving',
        calories: Math.round(totals.calories), protein_g: Math.round(totals.protein_g),
        carbs_g: Math.round(totals.carbs_g), fat_g: Math.round(totals.fat_g),
        fiber_g: Math.round(totals.fiber_g), sugar_g: Math.round(totals.sugar_g),
      });
      await api.post(`/meals/${mealId}/items`, { food_id: food.id, quantity: 1 });
      // Store each ingredient so breakdown can be viewed and edited later
      for (const item of ingredList) {
        const qty = convertToServingUnit(item.quantity, item.unit || item.food.serving_unit, item.food.serving_unit);
        await api.post(`/foods/${food.id}/ingredients`, { ingredient_food_id: item.food.id, quantity: qty });
      }
    },
    onSuccess: () => {
      onAdded();
      setLastAdded(ingredMealName.trim() || 'Mixed Ingredients');
      setIngredList([]);
      setIngredSearch('');
      setIngredMealName('');
      setShowQuickLog(false);
    },
  });

  const ingredTotals = ingredList.reduce((acc, { food, quantity: qty, unit: u }) => {
    const scale = convertToServingUnit(qty, u || food.serving_unit, food.serving_unit) / food.serving_size;
    return {
      calories:  acc.calories  + food.calories  * scale,
      protein_g: acc.protein_g + food.protein_g * scale,
      carbs_g:   acc.carbs_g   + food.carbs_g   * scale,
      fat_g:     acc.fat_g     + food.fat_g     * scale,
      fiber_g:   acc.fiber_g   + (food.fiber_g || 0) * scale,
    };
  }, { calories: 0, protein_g: 0, carbs_g: 0, fat_g: 0, fiber_g: 0 });

  const effectiveUnit = unit || (selected?.serving_unit ?? '');
  const convertedQty = selected && quantity
    ? convertToServingUnit(parseFloat(quantity), effectiveUnit, selected.serving_unit)
    : 0;
  const scale = selected && convertedQty > 0 ? convertedQty / selected.serving_size : 0;
  const preview = selected && scale > 0 ? {
    calories:  Math.round(selected.calories  * scale),
    protein_g: Math.round(selected.protein_g * scale),
    carbs_g:   Math.round(selected.carbs_g   * scale),
    fat_g:     Math.round(selected.fat_g     * scale),
    fiber_g:   Math.round((selected.fiber_g || 0) * scale),
  } : null;

  const setC = (k: keyof Food) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setCreateForm(f => ({ ...f, [k]: e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }));

  // ── Recent Items screen ──────────────────────────────────────────────────────
  if (showRecent) {
    // Group items by meal_date for display context
    const today = fmt(new Date());
    const yesterday = fmt(new Date(Date.now() - 86400000));

    const dateLabel = (d: string) =>
      d === today ? 'Today' : d === yesterday ? 'Yesterday' : new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    return (
      <Modal open={open} onClose={onClose} title="Recent Foods" size="md">
        <div className="space-y-3">
          {lastAdded && (
            <div className="flex items-center gap-2 bg-indigo-950 border border-indigo-800 rounded-xl px-3 py-2">
              <span className="text-indigo-400 text-xs">✓</span>
              <span className="text-xs text-indigo-300 flex-1 truncate">Added: {lastAdded}</span>
              <button onClick={() => setLastAdded(null)} className="text-indigo-600 hover:text-indigo-400 text-xs">✕</button>
            </div>
          )}
          {recentItems.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-8">No recent items yet — log some meals first.</p>
          ) : (
            <div className="space-y-1 max-h-[28rem] overflow-y-auto">
              {recentItems.map(item => (
                <button
                  key={item.item_id}
                  onClick={() => addRecentItem.mutate(item)}
                  disabled={addRecentItem.isPending}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-800 text-left transition-colors group"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white font-medium truncate">{item.food_name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[11px] text-gray-500">
                        {item.quantity}{item.serving_unit} · {Math.round(item.calories)} kcal
                      </span>
                      <span className="text-[10px] text-gray-700">
                        {dateLabel(item.meal_date)} · {MEAL_LABELS[item.meal_type] ?? item.meal_type}
                      </span>
                      {!item.is_mine && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-400 shrink-0">
                          via {item.logged_by_name}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 text-[11px] text-gray-600 text-right">
                    <div className="text-sky-400/70">{Math.round(item.protein_g)}P</div>
                    <div className="text-amber-400/70">{Math.round(item.carbs_g)}C</div>
                    <div className="text-orange-400/70">{Math.round(item.fat_g)}F</div>
                  </div>
                  <Plus size={14} className="text-gray-700 group-hover:text-indigo-400 transition-colors shrink-0" />
                </button>
              ))}
            </div>
          )}
          <Button variant="secondary" onClick={() => setShowRecent(false)} className="w-full">
            Back to search
          </Button>
        </div>
      </Modal>
    );
  }

  if (showQuickLog) {
    const setQM = (k: keyof typeof quickMacros) => (e: React.ChangeEvent<HTMLInputElement>) =>
      setQuickMacros(f => ({ ...f, [k]: e.target.type === 'number' ? parseFloat(e.target.value) || 0 : e.target.value }));

    return (
      <Modal open={open} onClose={onClose} title="Quick Log" size="md">
        <div className="space-y-4">
          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
            {(['macros', 'ingredients'] as const).map(tab => (
              <button key={tab} onClick={() => setQuickTab(tab)}
                className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-colors capitalize ${
                  quickTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'
                }`}>
                {tab === 'macros' ? 'By macros' : 'By ingredients'}
              </button>
            ))}
          </div>

          {quickTab === 'macros' && (
            <div className="space-y-3">
              <Input label="Name (optional)" value={quickMacros.name} onChange={setQM('name')} placeholder="e.g. Pasta salad, chicken burrito…" autoFocus />
              <div className="grid grid-cols-2 gap-2">
                {(() => {
                  const logOnEnter = (e: React.KeyboardEvent) => { if (e.key === 'Enter' && quickMacros.calories > 0 && !quickLogMacros.isPending) quickLogMacros.mutate(); };
                  return (<>
                    <Input label="Calories *" type="number" value={quickMacros.calories || ''} onChange={setQM('calories')} onKeyDown={logOnEnter} />
                    <Input label="Protein (g)" type="number" value={quickMacros.protein_g || ''} onChange={setQM('protein_g')} onKeyDown={logOnEnter} />
                    <Input label="Carbs (g)" type="number" value={quickMacros.carbs_g || ''} onChange={setQM('carbs_g')} onKeyDown={logOnEnter} />
                    <Input label="Fat (g)" type="number" value={quickMacros.fat_g || ''} onChange={setQM('fat_g')} onKeyDown={logOnEnter} />
                    <Input label="Fiber (g)" type="number" value={quickMacros.fiber_g || ''} onChange={setQM('fiber_g')} onKeyDown={logOnEnter} />
                    <Input label="Sugar (g)" type="number" value={quickMacros.sugar_g || ''} onChange={setQM('sugar_g')} onKeyDown={logOnEnter} />
                  </>);
                })()}
              </div>
              <div className="flex gap-2 pt-1">
                <Button variant="secondary" onClick={() => setShowQuickLog(false)} className="flex-1">Back</Button>
                <Button onClick={() => quickLogMacros.mutate()}
                  disabled={quickMacros.calories <= 0 || quickLogMacros.isPending} className="flex-1">
                  {quickLogMacros.isPending ? 'Logging…' : 'Log It'}
                </Button>
              </div>
            </div>
          )}

          {quickTab === 'ingredients' && (
            <div className="space-y-3">
              <Input label="Meal name (optional)" value={ingredMealName}
                onChange={e => setIngredMealName(e.target.value)}
                placeholder="e.g. Oatmeal with berries, veggie bowl…" />
              <Input label="Add ingredient" value={ingredSearch}
                onChange={e => setIngredSearch(e.target.value)}
                placeholder="Search for an ingredient…" autoFocus />

              {ingredSearch.length >= 1 && ingredFoods.length > 0 && (
                <div className="space-y-1 max-h-36 overflow-y-auto">
                  {ingredFoods.map(food => (
                    <button key={food.id}
                      onClick={() => {
                        if (!ingredList.find(i => i.food.id === food.id)) {
                          setIngredList(l => [...l, { food, quantity: food.serving_size, unit: food.serving_unit }]);
                        }
                        setIngredSearch('');
                      }}
                      className="w-full flex items-center justify-between px-3 py-2 rounded-xl hover:bg-gray-800 text-left transition-colors">
                      <span className="text-sm text-white">{food.name}</span>
                      <span className="text-xs text-gray-500 shrink-0 ml-2">{food.calories} kcal / {food.serving_size}{food.serving_unit}</span>
                    </button>
                  ))}
                  <button
                    onClick={() => { setCreateFoodTarget('ingredient'); setCreateForm(f => ({ ...f, name: ingredSearch })); setShowCreate(true); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 text-sm transition-colors"
                  >
                    <Plus size={13} /> Create "{ingredSearch}"
                  </button>
                </div>
              )}
              {ingredSearch.length >= 1 && ingredFoods.length === 0 && (
                <div className="text-center py-3">
                  <p className="text-sm text-gray-500 mb-2">No results for "{ingredSearch}"</p>
                  <Button size="sm" variant="secondary" onClick={() => { setCreateFoodTarget('ingredient'); setCreateForm(f => ({ ...f, name: ingredSearch })); setShowCreate(true); }}>
                    <Plus size={13} /> Create "{ingredSearch}"
                  </Button>
                </div>
              )}

              {ingredList.length > 0 && (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    {ingredList.map((item, i) => (
                      <div key={item.food.id} className="flex items-center gap-2 px-3 py-2 bg-gray-800 rounded-xl">
                        <span className="text-sm text-white flex-1 truncate">{item.food.name}</span>
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={e => setIngredList(l => l.map((it, j) => j === i ? { ...it, quantity: parseFloat(e.target.value) || 0 } : it))}
                          className="w-16 text-sm text-right bg-gray-700 rounded-lg px-2 py-1 text-white border-0 outline-none"
                        />
                        <select
                          value={item.unit}
                          onChange={e => setIngredList(l => l.map((it, j) => j === i ? { ...it, unit: e.target.value } : it))}
                          className="text-xs bg-gray-700 rounded px-1 py-1 text-gray-300 border-0 min-w-[52px]"
                        >
                          {(MASS_VOL_UNITS.includes(item.food.serving_unit) ? MASS_VOL_UNITS : [item.food.serving_unit]).map(u => (
                            <option key={u} value={u}>{u}</option>
                          ))}
                        </select>
                        <button onClick={() => setIngredList(l => l.filter((_, j) => j !== i))}
                          className="text-gray-600 hover:text-red-400 text-xs ml-1">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="bg-gray-800 rounded-xl px-3 py-2.5 flex gap-3 text-sm flex-wrap">
                    <span className="text-white font-semibold">{Math.round(ingredTotals.calories)} kcal</span>
                    <span className="text-sky-400">{Math.round(ingredTotals.protein_g)}g P</span>
                    <span className="text-amber-400">{Math.round(ingredTotals.carbs_g)}g C</span>
                    <span className="text-orange-400">{Math.round(ingredTotals.fat_g)}g Fat</span>
                    <span className="text-emerald-400">{Math.round(ingredTotals.fiber_g)}g Fib</span>
                  </div>
                  {ingredMealName.trim() && (
                    <p className="text-[11px] text-indigo-400">Will log as one item: "{ingredMealName.trim()}"</p>
                  )}
                  <Button onClick={() => quickLogIngredients.mutate()}
                    disabled={quickLogIngredients.isPending} className="w-full">
                    {quickLogIngredients.isPending ? 'Logging…' : ingredMealName.trim() ? `Log as "${ingredMealName.trim()}"` : `Log ${ingredList.length} ingredient${ingredList.length !== 1 ? 's' : ''}`}
                  </Button>
                </div>
              )}

              <Button variant="secondary" onClick={() => setShowQuickLog(false)} className="w-full">Back</Button>
            </div>
          )}
        </div>
      </Modal>
    );
  }

  if (showCreate) {
    return (
      <Modal open={open} onClose={onClose} title="New Food" size="md">
        <div className="space-y-3">
          <Input label="Food name *" value={createForm.name ?? ''} onChange={setC('name')} placeholder="e.g. Greek Yogurt"
            onKeyDown={e => { if (e.key === 'Enter' && createForm.name && !createFood.isPending) createFood.mutate(createForm); }} />
          <Input label="Brand" value={createForm.brand ?? ''} onChange={setC('brand')} placeholder="e.g. Chobani (optional)" />
          <div className="grid grid-cols-2 gap-2">
            <Input label="Serving size" type="number" value={createForm.serving_size} onChange={setC('serving_size')} />
            <Select label="Unit" value={createForm.serving_unit ?? 'g'}
              onChange={e => setCreateForm(f => ({ ...f, serving_unit: e.target.value }))}
              options={UNIT_OPTIONS} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Input label="Calories" type="number" value={createForm.calories} onChange={setC('calories')} />
            <Input label="Protein (g)" type="number" value={createForm.protein_g} onChange={setC('protein_g')} />
            <Input label="Carbs (g)" type="number" value={createForm.carbs_g} onChange={setC('carbs_g')} />
            <Input label="Fat (g)" type="number" value={createForm.fat_g} onChange={setC('fat_g')} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">Back</Button>
            <Button onClick={() => createFood.mutate(createForm)} disabled={!createForm.name || createFood.isPending} className="flex-1">
              {createFood.isPending ? 'Saving…' : 'Save Food'}
            </Button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Add Food to Meal" size="md">
      <div className="space-y-4">

        {/* Restaurant quick-filter chips */}
        <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-0.5">
          {RESTAURANT_FILTERS.map(f => (
            <button
              key={f.label}
              onClick={() => { setSearch(f.q); setSelected(null); setLastAdded(null); }}
              className={`shrink-0 px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
                search === f.q
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Quick action row */}
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => { setShowRecent(true); setLastAdded(null); }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 text-xs font-medium transition-colors">
            <Clock size={12} /> Recent
            {recentItems.length > 0 && <span className="ml-0.5 text-[10px] text-gray-600">({recentItems.length})</span>}
          </button>
          <button onClick={() => { setShowQuickLog(true); setLastAdded(null); }}
            className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 text-xs font-medium transition-colors">
            <Zap size={12} /> Quick log
          </button>
        </div>

        {/* Last-added success toast */}
        {lastAdded && (
          <div className="flex items-center gap-2 bg-indigo-950 border border-indigo-800 rounded-xl px-3 py-2">
            <span className="text-indigo-400 text-xs">✓</span>
            <span className="text-xs text-indigo-300 flex-1 truncate">Added: {lastAdded}</span>
            <button onClick={() => setLastAdded(null)} className="text-indigo-600 hover:text-indigo-400 text-xs">✕</button>
          </div>
        )}

        <Input
          label="Search food"
          placeholder="e.g. chicken breast, oats…"
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(null); setLastAdded(null); }}
          autoFocus
        />

        {search && foods.length === 0 && (
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-2">No results for "{search}"</p>
            <Button size="sm" variant="secondary" onClick={() => { setCreateForm(f => ({ ...f, name: search })); setShowCreate(true); }}>
              <Plus size={13} /> Create "{search}"
            </Button>
          </div>
        )}

        {foods.length > 0 && !selected && (
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {foods.map(food => (
              <button
                key={food.id}
                onClick={() => { setSelected(food); setQuantity(String(food.serving_size)); setUnit(food.serving_unit); }}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-gray-800 text-left transition-colors"
              >
                <div>
                  <p className="text-sm text-white">{food.name}</p>
                  <p className="text-xs text-gray-500">{food.brand ? `${food.brand} · ` : ''}per {food.serving_size} {food.serving_unit}</p>
                </div>
                <span className="text-xs text-gray-400 shrink-0 ml-2">{food.calories} kcal</span>
              </button>
            ))}
            <button onClick={() => { setCreateForm(f => ({ ...f, name: search })); setShowCreate(true); }} className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl border border-dashed border-gray-700 hover:border-indigo-500 text-gray-500 hover:text-indigo-400 text-sm transition-colors">
              <Plus size={13} /> Add new food…
            </button>
          </div>
        )}

        {selected && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-white">{selected.name}</p>
                <p className="text-xs text-gray-500">per {selected.serving_size} {selected.serving_unit}: {selected.calories} kcal</p>
              </div>
              <button onClick={() => setSelected(null)} className="text-xs text-gray-500 hover:text-white">change</button>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs text-gray-400">Quantity</p>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={quantity}
                  onChange={e => setQuantity(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && quantity && parseFloat(quantity) > 0 && !addItem.isPending) addItem.mutate(); }}
                  autoFocus
                  className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white outline-none focus:border-indigo-500"
                />
                <select
                  value={unit}
                  onChange={e => setUnit(e.target.value)}
                  className="bg-gray-800 border border-gray-700 rounded-xl px-2 text-sm text-white min-w-[72px] focus:border-indigo-500"
                >
                  {(MASS_VOL_UNITS.includes(selected.serving_unit) ? MASS_VOL_UNITS : [selected.serving_unit]).map(u => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
            </div>
            {preview && (
              <div className="bg-gray-800 rounded-xl p-3">
                <p className="text-xs text-gray-500 mb-2">Macros for {quantity} {unit}</p>
                <div className="flex gap-3 text-sm flex-wrap">
                  <span className="text-white font-semibold">{preview.calories} kcal</span>
                  <span className="text-sky-400">{preview.protein_g}g P</span>
                  <span className="text-amber-400">{preview.carbs_g}g C</span>
                  <span className="text-orange-400">{preview.fat_g}g Fat</span>
                  {(preview.fiber_g ?? 0) > 0 && <span className="text-emerald-400">{preview.fiber_g}g Fib</span>}
                </div>
              </div>
            )}
            <Button
              onClick={() => addItem.mutate()}
              disabled={!quantity || parseFloat(quantity) <= 0 || addItem.isPending}
              className="w-full"
            >
              {addItem.isPending ? 'Adding…' : 'Add to Meal'}
            </Button>
          </div>
        )}

        {lastAdded && (
          <Button variant="secondary" onClick={onClose} className="w-full">
            Done
          </Button>
        )}
      </div>
    </Modal>
  );
}

// ─── Start Workout Modal ──────────────────────────────────────────────────────

function useRoutinePickerState(user: User | undefined, open: boolean) {
  const uid = user?.id;
  const { data: routines = [] } = useQuery({
    queryKey: ['routines', uid],
    queryFn: () => api.get<Routine[]>(`/routines/user/${uid}`),
    enabled: open && uid != null,
  });
  const { data: recentHistory = [] } = useQuery({
    queryKey: ['workout-history-recent', uid],
    queryFn: () => api.get<WorkoutSession[]>(`/workouts/user/${uid}?limit=30`),
    enabled: open && uid != null,
    staleTime: 60_000,
  });
  const { data: regimes = [] } = useQuery({
    queryKey: ['regimes', uid],
    queryFn: () => api.get<WorkoutRegime[]>(`/regimes/user/${uid}`),
    enabled: open && uid != null && !!user?.active_regime_id,
  });

  const lastDoneMap = useMemo(() => {
    const map: Record<number, Date> = {};
    for (const s of recentHistory) {
      if (s.routine_id && s.completed_at) {
        const d = parseSQLiteLocal(s.completed_at);
        if (!map[s.routine_id] || d > map[s.routine_id]) map[s.routine_id] = d;
      }
    }
    return map;
  }, [recentHistory]);

  const sortedRoutines = useMemo(() =>
    [...routines].sort((a, b) => {
      const aT = lastDoneMap[a.id]?.getTime() ?? 0;
      const bT = lastDoneMap[b.id]?.getTime() ?? 0;
      return bT !== aT ? bT - aT : a.name.localeCompare(b.name);
    }),
  [routines, lastDoneMap]);

  const activeRegime = regimes.find(r => r.id === user?.active_regime_id) ?? null;
  const suggestedRoutineId = activeRegime?.next_routine_id ?? null;

  return { sortedRoutines, lastDoneMap, suggestedRoutineId, historyLength: recentHistory.length };
}

function RoutinePickerList({
  sortedRoutines, lastDoneMap, suggestedRoutineId,
  selected, onSelect,
  expandedId, onToggleExpand,
}: {
  sortedRoutines: Routine[];
  lastDoneMap: Record<number, Date>;
  suggestedRoutineId: number | null;
  selected: number | null;
  onSelect: (id: number | null) => void;
  expandedId: number | null;
  onToggleExpand: (id: number | null) => void;
}) {
  return (
    <div className="space-y-1.5 max-h-52 overflow-y-auto pr-0.5">
      <button
        onClick={() => onSelect(null)}
        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
          selected === null ? 'bg-indigo-900/40 border border-indigo-700/60' : 'bg-gray-800 hover:bg-gray-700/80'
        }`}
      >
        <div className="w-8 h-8 rounded-lg bg-gray-700 flex items-center justify-center shrink-0">
          <Zap size={14} className="text-gray-400" />
        </div>
        <div>
          <p className="text-sm text-white font-medium">Ad-hoc</p>
          <p className="text-[11px] text-gray-500">Free-form — no routine</p>
        </div>
        {selected === null && <Check size={13} className="text-indigo-400 ml-auto shrink-0" />}
      </button>

      {sortedRoutines.map(r => {
        const lastDone = lastDoneMap[r.id];
        const isSelected = selected === r.id;
        const isExpanded = expandedId === r.id;
        return (
          <div key={r.id} className={`rounded-xl transition-colors ${isSelected ? 'bg-indigo-900/40 border border-indigo-700/60' : 'bg-gray-800'}`}>
            <div className="w-full flex items-center gap-3 px-3 py-2.5">
              <button onClick={() => onSelect(r.id)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-indigo-700' : 'bg-gray-700'}`}>
                  <ListChecks size={14} className={isSelected ? 'text-white' : 'text-gray-400'} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm text-white font-medium truncate">{r.name}</p>
                    {suggestedRoutineId === r.id && (
                      <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 shrink-0">Up next</span>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {r.exercises.length} exercises
                    {lastDone && <span className="text-indigo-400/80"> · {daysAgoLabel(lastDone)}</span>}
                  </p>
                </div>
              </button>
              {isSelected && <Check size={13} className="text-indigo-400 shrink-0" />}
              <button onClick={() => onToggleExpand(isExpanded ? null : r.id)} className="p-1 shrink-0 text-gray-500 hover:text-white">
                {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
            </div>
            {isExpanded && (
              <div className="border-t border-gray-700/60 divide-y divide-gray-700/40">
                {r.exercises.map((re, idx) => (
                  <div key={re.id} className="px-3 py-1.5 flex items-center gap-2 text-xs">
                    <span className="text-gray-600 w-4 shrink-0">{idx + 1}.</span>
                    <span className="text-gray-300 flex-1 truncate">{re.exercise_name}</span>
                    <span className="text-gray-500 shrink-0">
                      {re.sets} × {re.exercise_type === 'timed' ? `${re.duration_seconds}s` : `${re.reps}${re.weight_value ? ` @ ${re.weight_value}${re.weight_unit}` : ''}`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function StartWorkoutModal({ open, users, userId, onClose, onStart, onStartPair, loading }: {
  open: boolean;
  users: User[];
  userId: number;
  onClose: () => void;
  onStart: (routineId?: number, uid?: number) => void;
  onStartPair: (routineIds: Record<number, number | undefined>) => void;
  loading: boolean;
}) {
  const [routineIdA, setRoutineIdA] = useState<number | null>(null);
  const [routineIdB, setRoutineIdB] = useState<number | null>(null);
  const [expandedA, setExpandedA] = useState<number | null>(null);
  const [expandedB, setExpandedB] = useState<number | null>(null);
  const [mode, setMode] = useState<'solo' | 'pair'>('solo');

  const activeUser = users.find(u => u.id === userId);
  const otherUser  = users.find(u => u.id !== userId);

  const pickerA = useRoutinePickerState(activeUser, open);
  const pickerB = useRoutinePickerState(otherUser, open && mode === 'pair');

  // Auto-select for user A
  useEffect(() => {
    if (!open) { setRoutineIdA(null); return; }
    if (pickerA.suggestedRoutineId != null) setRoutineIdA(pickerA.suggestedRoutineId);
    else if (pickerA.sortedRoutines.length > 0 && pickerA.lastDoneMap[pickerA.sortedRoutines[0].id])
      setRoutineIdA(pickerA.sortedRoutines[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, pickerA.historyLength, pickerA.suggestedRoutineId]);

  // Auto-select for user B
  useEffect(() => {
    if (!open || mode !== 'pair') { setRoutineIdB(null); return; }
    if (pickerB.suggestedRoutineId != null) setRoutineIdB(pickerB.suggestedRoutineId);
    else if (pickerB.sortedRoutines.length > 0 && pickerB.lastDoneMap[pickerB.sortedRoutines[0].id])
      setRoutineIdB(pickerB.sortedRoutines[0].id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, pickerB.historyLength, pickerB.suggestedRoutineId]);

  const handleStart = () => {
    if (mode === 'pair') {
      onStartPair({
        [userId]: routineIdA ?? undefined,
        ...(otherUser ? { [otherUser.id]: routineIdB ?? undefined } : {}),
      });
    } else {
      onStart(routineIdA ?? undefined, userId);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Start Workout" size="sm">
      <div className="space-y-4">
        {users.length >= 2 && (
          <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
            <button
              onClick={() => setMode('solo')}
              className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${mode === 'solo' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}
            >
              {activeUser?.name} only
            </button>
            <button
              onClick={() => setMode('pair')}
              className={`flex-1 text-xs py-1.5 rounded-lg transition-colors ${mode === 'pair' ? 'bg-gray-700 text-white' : 'text-gray-500'}`}
            >
              <Zap size={11} className="inline mr-1" />Pair ({users.map(u => u.name).join(' + ')})
            </button>
          </div>
        )}

        {mode === 'solo' ? (
          <div>
            <p className="text-xs text-gray-500 mb-2">Choose routine</p>
            <RoutinePickerList
              sortedRoutines={pickerA.sortedRoutines}
              lastDoneMap={pickerA.lastDoneMap}
              suggestedRoutineId={pickerA.suggestedRoutineId}
              selected={routineIdA}
              onSelect={setRoutineIdA}
              expandedId={expandedA}
              onToggleExpand={setExpandedA}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {([
              { user: activeUser, picker: pickerA, selected: routineIdA, setSelected: setRoutineIdA, expanded: expandedA, setExpanded: setExpandedA },
              { user: otherUser,  picker: pickerB, selected: routineIdB, setSelected: setRoutineIdB, expanded: expandedB, setExpanded: setExpandedB },
            ] as const).map(({ user, picker, selected, setSelected, expanded, setExpanded }) => user && (
              <div key={user.id}>
                <div className="flex items-center gap-1.5 mb-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: user.avatar_color }} />
                  <p className="text-xs text-gray-400 font-medium">{user.name}</p>
                </div>
                <RoutinePickerList
                  sortedRoutines={picker.sortedRoutines}
                  lastDoneMap={picker.lastDoneMap}
                  suggestedRoutineId={picker.suggestedRoutineId}
                  selected={selected}
                  onSelect={setSelected}
                  expandedId={expanded}
                  onToggleExpand={setExpanded}
                />
              </div>
            ))}
          </div>
        )}

        {mode === 'pair' && (
          <p className="text-xs text-gray-500 bg-gray-800 rounded-lg px-3 py-2">
            Opens split-screen view for both users. Each user logs their own sets independently.
          </p>
        )}

        <Button onClick={handleStart} disabled={loading} className="w-full">
          {loading ? 'Starting…' : mode === 'pair' ? 'Start Pair Workout' : 'Start Tracked Workout'}
        </Button>
      </div>
    </Modal>
  );
}

// ─── Log Workout Picker ───────────────────────────────────────────────────────

function LogWorkoutPickerModal({ open, onClose, onLogActivity, onStartTracked }: {
  open: boolean; onClose: () => void;
  onLogActivity: () => void; onStartTracked: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="Log Activity" size="sm">
      <div className="space-y-3">
        <button
          onClick={onStartTracked}
          className="w-full flex items-center gap-3 bg-indigo-950 border border-indigo-800 hover:border-indigo-600 rounded-2xl p-4 text-left transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-indigo-700 flex items-center justify-center shrink-0">
            <Dumbbell size={18} className="text-white" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Start tracked workout</p>
            <p className="text-xs text-indigo-300">Log sets & reps live — app estimates calories</p>
          </div>
        </button>
        <button
          onClick={onLogActivity}
          className="w-full flex items-center gap-3 bg-gray-900 border border-gray-700 hover:border-gray-600 rounded-2xl p-4 text-left transition-colors"
        >
          <div className="w-9 h-9 rounded-xl bg-orange-900 flex items-center justify-center shrink-0">
            <Flame size={18} className="text-orange-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">Log past activity / workout</p>
            <p className="text-xs text-gray-400">Strength, run, hike — enter calories & pick date</p>
          </div>
        </button>
      </div>
    </Modal>
  );
}

// ─── Log Activity Modal ───────────────────────────────────────────────────────

const ACTIVITY_PRESETS = [
  { label: 'Walk', group: 'cardio' },
  { label: 'Run', group: 'cardio' },
  { label: 'Hike', group: 'cardio' },
  { label: 'Bike Ride', group: 'cardio' },
  { label: 'Swim', group: 'cardio' },
  { label: 'Strength Training', group: 'strength' },
  { label: 'HIIT', group: 'strength' },
  { label: 'Yoga', group: 'recovery' },
  { label: 'Stretching', group: 'recovery' },
  { label: 'Yard Work', group: 'other' },
  { label: 'Other', group: 'other' },
];

function LogActivityModal({ open, onClose, onSave, loading }: {
  open: boolean; onClose: () => void;
  onSave: (data: { name: string; duration_minutes: number; calories_burned: number; date?: string }) => void;
  loading: boolean;
}) {
  const [name, setName] = useState('');
  const [duration, setDuration] = useState('');
  const [calories, setCalories] = useState('');
  const todayStr = fmt(new Date());
  const [activityDate, setActivityDate] = useState(todayStr);

  const canSave = name.trim() && parseFloat(calories) > 0;
  const handleSave = () => {
    if (canSave && !loading) {
      onSave({
        name: name.trim(),
        duration_minutes: parseFloat(duration) || 0,
        calories_burned: parseFloat(calories),
        date: activityDate !== todayStr ? activityDate : undefined,
      });
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Log Activity" size="sm">
      <div className="space-y-4">
        <div>
          <p className="text-xs text-gray-500 mb-2">Activity type</p>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {ACTIVITY_PRESETS.map(p => (
              <button key={p.label} onClick={() => setName(p.label)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  name === p.label ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}>{p.label}</button>
            ))}
          </div>
          <Input label="Or type a custom name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Pickleball, CrossFit, Rowing…" />
        </div>

        {/* Date picker — defaults to today, allow past dates */}
        <div>
          <label className="block text-xs text-gray-400 mb-1">Date</label>
          <input
            type="date"
            value={activityDate}
            max={todayStr}
            onChange={e => setActivityDate(e.target.value)}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-sm text-white focus:border-indigo-500 outline-none"
          />
          {activityDate !== todayStr && (
            <p className="text-[11px] text-indigo-400 mt-1">Logging for {new Date(activityDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Duration (min)" type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g. 45"
            onKeyDown={e => e.key === 'Enter' && handleSave()} />
          <Input label="Calories burned *" type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="e.g. 300"
            onKeyDown={e => e.key === 'Enter' && handleSave()} />
        </div>
        <p className="text-[11px] text-gray-600">Tip: use a fitness app or wearable for accurate values, or rough averages (walk ~4 kcal/min, run ~10 kcal/min, strength ~5–8 kcal/min).</p>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || loading} className="flex-1">
            <Flame size={14} /> {loading ? 'Saving…' : 'Log Activity'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
