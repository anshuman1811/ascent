import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { useState } from 'react';
import { ChevronLeft, ChevronRight, Flame, Dumbbell, TrendingDown, TrendingUp, Minus } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { DailySummary } from '../types';
import { CalorieRing, MacroPills, MacroBar } from '../components/ui/MacroDisplay';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface OutletCtx { userId: number; }

function fmt(d: Date) { return d.toISOString().split('T')[0]; }

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner',
  snack: 'Snack', pre_workout: 'Pre-workout', post_workout: 'Post-workout',
};

export default function Dashboard({ userId: propUserId }: { userId?: number }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;

  const [date, setDate] = useState(fmt(new Date()));
  const isToday = date === fmt(new Date());

  const { data: summary } = useQuery({
    queryKey: ['daily-summary', userId, date],
    queryFn: () => api.get<DailySummary>(`/dashboard/${userId}/daily?date=${date}`),
    enabled: !!userId,
    refetchInterval: 30_000,
  });

  const weekEnd = fmt(new Date());
  const { data: weekly } = useQuery({
    queryKey: ['weekly', userId, weekEnd],
    queryFn: () => api.get<any[]>(`/dashboard/${userId}/weekly?date=${weekEnd}`),
    enabled: !!userId,
  });

  function shiftDate(delta: number) {
    const d = new Date(date + 'T12:00:00');
    d.setDate(d.getDate() + delta);
    setDate(fmt(d));
  }

  const c = summary?.classification;
  const classColor = c === 'deficit' ? 'text-indigo-400' : c === 'surplus' ? 'text-red-400' : c === 'maintenance' ? 'text-green-400' : 'text-gray-400';
  const classIcon = c === 'deficit' ? <TrendingDown size={14} /> : c === 'surplus' ? <TrendingUp size={14} /> : c === 'maintenance' ? <Minus size={14} /> : null;

  return (
    <div className="space-y-5">
      {/* Date navigator */}
      <div className="flex items-center justify-between">
        <button onClick={() => shiftDate(-1)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white">
          <ChevronLeft size={18} />
        </button>
        <div className="text-center">
          <p className="text-sm font-semibold text-white">
            {isToday ? 'Today' : new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
          </p>
          {!isToday && <p className="text-xs text-gray-500">{date}</p>}
        </div>
        <button onClick={() => shiftDate(1)} disabled={isToday} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white disabled:opacity-30">
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calorie overview */}
      {summary && (
        <div className="bg-gray-900 rounded-2xl p-5 border border-gray-800">
          <div className="flex items-center gap-6">
            <CalorieRing
              consumed={summary.meals.calories}
              target={summary.targets.calorie_target ?? 2000}
              burned={summary.exercise.calories_burned}
            />
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                {classIcon && <span className={classColor}>{classIcon}</span>}
                <span className={`text-sm font-semibold capitalize ${classColor}`}>
                  {summary.classification ?? 'No target set'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex items-center gap-1.5 text-gray-400">
                  <Flame size={14} className="text-orange-400" />
                  <span>{Math.round(summary.meals.calories)} eaten</span>
                </div>
                <div className="flex items-center gap-1.5 text-gray-400">
                  <Dumbbell size={14} className="text-green-400" />
                  <span>{Math.round(summary.exercise.calories_burned)} burned</span>
                </div>
              </div>
              <MacroBar macros={summary.meals} />
              <MacroPills macros={summary.meals} compact />
            </div>
          </div>
        </div>
      )}

      {/* Macro targets */}
      {summary?.targets.protein_target_g && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Macro Targets</h2>
          <div className="space-y-2">
            {[
              { label: 'Protein', val: summary.meals.protein_g, target: summary.targets.protein_target_g!, color: 'bg-blue-500', unit: 'g' },
              { label: 'Carbs',   val: summary.meals.carbs_g,   target: summary.targets.carbs_target_g!,   color: 'bg-yellow-500', unit: 'g' },
              { label: 'Fat',     val: summary.meals.fat_g,     target: summary.targets.fat_target_g!,     color: 'bg-orange-500', unit: 'g' },
              ...(summary.targets.fiber_target_g ? [{ label: 'Fiber', val: summary.meals.fiber_g, target: summary.targets.fiber_target_g!, color: 'bg-green-500', unit: 'g' }] : []),
              ...(summary.targets.sodium_target_mg ? [{ label: 'Sodium', val: summary.meals.sodium_mg, target: summary.targets.sodium_target_mg!, color: 'bg-cyan-500', unit: 'mg' }] : []),
            ].map(({ label, val, target, color, unit }) => (
              <div key={label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-400">{label}</span>
                  <span className="text-white font-medium">{Math.round(val)}{unit} <span className="text-gray-500">/ {target}{unit}</span></span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${Math.min((val / (target || 1)) * 100, 100)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Micronutrient callouts — shown when data logged, no target required */}
      {summary && (summary.meals.sodium_mg > 0 || summary.meals.saturated_fat_g > 0) && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">Nutrition Label Totals</h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
            {summary.meals.sodium_mg > 0 && (
              <div>
                <p className="text-gray-500">Sodium</p>
                <p className="text-white font-semibold mt-0.5">{Math.round(summary.meals.sodium_mg)} mg
                  <span className={`ml-1.5 text-[10px] ${summary.meals.sodium_mg > 2300 ? 'text-red-400' : 'text-gray-500'}`}>
                    {summary.meals.sodium_mg > 2300 ? '↑ above 2300mg limit' : `/ 2300mg`}
                  </span>
                </p>
              </div>
            )}
            {summary.meals.saturated_fat_g > 0 && (
              <div>
                <p className="text-gray-500">Saturated Fat</p>
                <p className="text-white font-semibold mt-0.5">{Math.round(summary.meals.saturated_fat_g * 10) / 10} g</p>
              </div>
            )}
            {summary.meals.cholesterol_mg > 0 && (
              <div>
                <p className="text-gray-500">Cholesterol</p>
                <p className="text-white font-semibold mt-0.5">{Math.round(summary.meals.cholesterol_mg)} mg</p>
              </div>
            )}
            {summary.meals.potassium_mg > 0 && (
              <div>
                <p className="text-gray-500">Potassium</p>
                <p className="text-white font-semibold mt-0.5">{Math.round(summary.meals.potassium_mg)} mg</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Meal breakdown */}
      {summary && summary.meal_breakdown.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-3">By Meal</h2>
          <div className="space-y-2">
            {summary.meal_breakdown.map(m => (
              <div key={m.meal_type} className="flex items-center justify-between">
                <span className="text-sm text-gray-300">{MEAL_LABELS[m.meal_type]}</span>
                <div className="flex items-center gap-3 text-xs text-gray-500">
                  <span className="text-white font-medium">{Math.round(m.calories)} kcal</span>
                  <span className="text-blue-400">{Math.round(m.protein_g)}g P</span>
                  <span className="text-yellow-400">{Math.round(m.carbs_g)}g C</span>
                  <span className="text-orange-400">{Math.round(m.fat_g)}g F</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Weekly chart */}
      {weekly && weekly.length > 0 && (
        <div className="bg-gray-900 rounded-2xl p-4 border border-gray-800">
          <h2 className="text-sm font-semibold text-gray-400 mb-4">Last 7 Days</h2>
          <ResponsiveContainer width="100%" height={120}>
            <BarChart data={weekly} barSize={24}>
              <XAxis dataKey="date" tickFormatter={d => new Date(d + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' })}
                tick={{ fill: '#6b7280', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip
                contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number, name: string) => [`${Math.round(v)} kcal`, name === 'calories_in' ? 'Eaten' : 'Target']}
              />
              <Bar dataKey="calories_in" radius={[4,4,0,0]}>
                {weekly.map((d, i) => (
                  <Cell key={i} fill={
                    d.classification === 'surplus' ? '#ef4444'
                    : d.classification === 'deficit' ? '#6366f1'
                    : '#22c55e'
                  } />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex gap-3 justify-center mt-2 text-xs text-gray-500">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> Maintenance</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500" /> Deficit</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Surplus</span>
          </div>
        </div>
      )}
    </div>
  );
}
