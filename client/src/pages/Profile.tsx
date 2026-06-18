import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Calculator, Trash2 } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { User, WeightLog } from '../types';
import { MACRO_CONFIG, DEFAULT_TRACKED_MACROS } from '../types';
import { calculateTDEE } from '../utils/tdee';
import { displayWeight, convertWeight, parseSQLiteLocal, type WeightUnit } from '../utils/units';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
import { useToast } from '../components/ui/Toast';
import { LineChart, Line, XAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface OutletCtx { userId: number; }

export default function Profile({ userId: propUserId }: { userId?: number }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;
  const qc = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.get<User>(`/users/${userId}`),
    enabled: !!userId,
  });

  const { data: weightLog = [] } = useQuery({
    queryKey: ['weight-log', userId],
    queryFn: () => api.get<WeightLog[]>(`/users/${userId}/weight-log?limit=30`),
    enabled: !!userId,
  });

  const [tab, setTab] = useState<'targets' | 'weight' | 'settings'>('targets');
  const [saving, setSaving] = useState(false);

  const saveProfile = useMutation({
    mutationFn: (data: Partial<User>) => api.put(`/users/${userId}/profile`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user', userId] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  const saveName = useMutation({
    mutationFn: (name: string) => api.put(`/users/${userId}`, { name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user', userId] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
  });

  if (!user) return null;

  return (
    <div className="space-y-5">
      {/* User header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold text-white"
          style={{ background: user.avatar_color }}>
          {user.name[0]}
        </div>
        <div className="flex-1">
          <EditableName name={user.name} onSave={name => saveName.mutate(name)} />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-800 rounded-xl p-1">
        {([['targets','Targets'],['weight','Weight'],['settings','Settings']] as const).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              tab === t ? 'bg-gray-900 text-white' : 'text-gray-500 hover:text-white'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'targets' && <TargetsTab user={user} weightLog={weightLog} onSave={data => saveProfile.mutate(data)} saving={saveProfile.isPending} />}
      {tab === 'weight' && <WeightTab userId={userId} weightLog={weightLog} user={user} qc={qc} />}
      {tab === 'settings' && <SettingsTab user={user} onSave={data => saveProfile.mutate(data)} saving={saveProfile.isPending} />}
    </div>
  );
}

function EditableName({ name, onSave }: { name: string; onSave: (n: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(name);
  if (editing) return (
    <form onSubmit={e => { e.preventDefault(); onSave(val); setEditing(false); }} className="flex gap-2">
      <input value={val} onChange={e => setVal(e.target.value)} className="flex-1 bg-gray-800 border border-indigo-500 rounded-lg px-2 py-1 text-sm text-white" autoFocus />
      <button type="submit" className="text-xs text-indigo-400">Save</button>
    </form>
  );
  return (
    <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-left">
      <span className="text-base font-bold text-white">{name}</span>
      <span className="text-xs text-gray-600 hover:text-gray-400">edit</span>
    </button>
  );
}

// Inline target number input used in the macro checklist
function MacroTargetInput({ value, onChange, max, step, unit }: {
  value: string | number; onChange: (v: number) => void; max: number; step: number; unit: string;
}) {
  const v = Number(value) || 0;
  return (
    <div className="flex items-center gap-1">
      <input type="number" value={v || ''} min={0} max={max} step={step}
        onChange={e => onChange(Number(e.target.value) || 0)}
        className="w-16 text-xs text-right bg-gray-800 rounded-lg px-2 py-1 text-white border border-gray-700 outline-none focus:border-indigo-500" />
      <span className="text-xs text-gray-500 w-4 shrink-0">{unit}</span>
    </div>
  );
}

// Goal offsets applied to TDEE to get calorie target
const GOAL_OFFSET: Record<string, number> = { lose: -500, lose_mild: -250, maintain: 0, gain: 250, gain_aggressive: 500 };

// NEAT offset above pure sedentary BMR × 1.2 — accounts for background daily movement
// (walking to meetings, stairs, errands) EXCLUDING formal workouts.
// Formal workout calories are added dynamically on workout days in the dashboard.
const NEAT_OFFSET: Record<string, number> = {
  sedentary: 0,    // desk all day, car commute, minimal movement
  light: 200,      // some walking, ~5–8k steps, office with movement
  moderate: 400,   // active day, ~10k+ steps, stand-up desk, active commute
};

// Evidence-based protein multipliers (g/kg body weight) per goal
// Sources: ISSN Position Stand, Helms et al. 2014, Morton et al. 2018
const PROTEIN_PER_KG: Record<string, number> = { lose: 2.0, lose_mild: 1.8, maintain: 1.6, gain: 1.8, gain_aggressive: 2.0 };

/** Pure helper — compute evidence-based macro targets from a calorie goal + body weight */
function computeMacros(
  cal: number,
  weightKg: number | null,
  goal: string,
  sex: string,
): { protein_target_g: number; carbs_target_g: number; fat_target_g: number; fiber_target_g: number } {
  let proteinG: number;
  let fatG: number;

  if (weightKg) {
    const multiplier = PROTEIN_PER_KG[goal] ?? 1.6;
    proteinG = Math.round(weightKg * multiplier);
    // Clamp to 15–40% of calories
    proteinG = Math.max(Math.round(cal * 0.15 / 4), Math.min(Math.round(cal * 0.40 / 4), proteinG));
    // Fat: 0.7 g/kg floor, 20% of calories floor, 35% ceiling
    fatG = Math.max(Math.round(weightKg * 0.7), Math.round(cal * 0.20 / 9));
    fatG = Math.min(fatG, Math.round(cal * 0.35 / 9));
  } else {
    proteinG = Math.round(cal * (goal === 'lose' ? 0.32 : 0.28) / 4);
    fatG = Math.round(cal * 0.25 / 9);
  }

  const carbsG = Math.max(0, Math.round((cal - proteinG * 4 - fatG * 9) / 4));

  // Fiber: 14g / 1000 kcal (IOM), clamped to sex-based range
  const fiberByCalories = Math.round(cal / 1000 * 14);
  const fiberMin = sex === 'female' ? 21 : 30;
  const fiberMax = sex === 'female' ? 25 : 38;
  const fiberG = Math.min(fiberMax, Math.max(fiberMin, fiberByCalories));

  // Sugar: NOT auto-filled. Food DBs only store total sugar (natural + added combined),
  // so a target here would unfairly flag fruit, dairy, etc. Users can set manually if wanted.

  return { protein_target_g: proteinG, carbs_target_g: carbsG, fat_target_g: fatG, fiber_target_g: fiberG };
}

function TargetsTab({ user, weightLog, onSave, saving }: { user: User; weightLog: WeightLog[]; onSave: (d: Partial<User>) => void; saving: boolean }) {
  const { toast } = useToast();

  // Initialize tracked_macros: use user's saved setting or fall back to defaults
  const initTrackedMacros = (): string[] =>
    user.tracked_macros?.length ? user.tracked_macros : [...DEFAULT_TRACKED_MACROS];

  const [form, setForm] = useState({
    birth_date: user.birth_date ?? '',
    sex: user.sex ?? 'male',
    height_value: user.height_value ?? '',
    height_unit: user.height_unit,
    activity_level: user.activity_level,
    calorie_target: user.calorie_target ?? '',
    tdee_estimate: user.tdee_estimate ?? '',
    // Per-macro target fields (all optional)
    protein_target_g:       user.protein_target_g       ?? '',
    carbs_target_g:         user.carbs_target_g         ?? '',
    fat_target_g:           user.fat_target_g           ?? '',
    fiber_target_g:         user.fiber_target_g         ?? '',
    added_sugar_target_g:   user.added_sugar_target_g   ?? '',
    saturated_fat_target_g: user.saturated_fat_target_g ?? '',
    sodium_target_mg:       user.sodium_target_mg       ?? '',
    cholesterol_target_mg:  user.cholesterol_target_mg  ?? '',
    potassium_target_mg:    user.potassium_target_mg    ?? '',
    // sugar_target_g intentionally excluded — no inherent limit on natural sugars
    weight_goal_type: user.weight_goal_type,
  });

  // Which macros are displayed on the dashboard
  const [trackedMacros, setTrackedMacros] = useState<string[]>(initTrackedMacros);

  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const sel = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  // Get latest body weight in kg (for macro calculation)
  const latestWeightKg = (() => {
    const w = weightLog[0];
    if (!w) return null;
    return w.weight_unit === 'kg' ? w.weight_value : w.weight_value * 0.453592;
  })();

  // Auto-fill macros on mount when calorie target is set but macros are missing
  useEffect(() => {
    const cal = Number(form.calorie_target);
    if (cal && (!user.carbs_target_g || !user.fat_target_g)) {
      const macros = computeMacros(cal, latestWeightKg, form.weight_goal_type, form.sex);
      setForm(f => ({ ...f, ...macros }));
      onSave(macros);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally mount-only — catches first-time setup

  // Toggle a macro's presence in the tracked list and immediately save
  function toggleMacro(key: string) {
    setTrackedMacros(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      // Immediately persist the tracking preference
      onSave({ tracked_macros: next } as Partial<User>);
      return next;
    });
  }

  // Auto-compute TDEE whenever physical stats or goal change — no manual button needed
  useEffect(() => {
    const latestWeight = weightLog[0];
    if (!form.birth_date || !Number(form.height_value) || !latestWeight) return;

    const baseParams = {
      weight_value: latestWeight.weight_value,
      weight_unit: latestWeight.weight_unit as any,
      height_value: Number(form.height_value),
      height_unit: form.height_unit as any,
      birth_date: form.birth_date,
      sex: form.sex as any,
    };
    const sedentaryTdee = calculateTDEE({ ...baseParams, activity_level: 'sedentary' });
    const neatOffset = NEAT_OFFSET[form.activity_level] ?? 0;

    const offset = GOAL_OFFSET[form.weight_goal_type] ?? 0;
    const target = Math.max(1200, sedentaryTdee + neatOffset + offset);

    setForm(f => {
      // Only auto-fill macros if they're missing (don't override user's custom targets)
      const needsMacros = !f.carbs_target_g && !f.fat_target_g;
      const macros = needsMacros ? computeMacros(target, latestWeightKg, form.weight_goal_type, form.sex) : {};
      return { ...f, tdee_estimate: String(sedentaryTdee), calorie_target: String(target), ...macros };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.birth_date, form.sex, form.height_value, form.height_unit, form.activity_level, form.weight_goal_type, latestWeightKg]);

  // When goal changes, just update the field — useEffect above handles calorie_target recalc
  function handleGoalChange(e: React.ChangeEvent<HTMLSelectElement>) {
    setForm(f => ({ ...f, weight_goal_type: e.target.value as any }));
  }

  // Manual macro auto-fill from current calorie target
  function handleAutoFill() {
    const cal = Number(form.calorie_target);
    if (!cal) { toast('Set a calorie target first.', 'error'); return; }
    const macros = computeMacros(cal, latestWeightKg, form.weight_goal_type, form.sex);
    setForm(f => ({ ...f, ...macros }));
    // Ensure the 4 core macros are tracked
    const coreKeys = DEFAULT_TRACKED_MACROS as string[];
    const merged = [...new Set([...trackedMacros, ...coreKeys])];
    if (merged.length !== trackedMacros.length || !coreKeys.every(k => trackedMacros.includes(k))) {
      setTrackedMacros(merged);
    }
    const basis = latestWeightKg
      ? `${Math.round(latestWeightKg)} kg body weight (${PROTEIN_PER_KG[form.weight_goal_type]} g/kg protein)`
      : 'calorie percentage split (log weight for body-weight-based targets)';
    toast(`Macros calculated from ${basis}`, 'info');
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Physical</p>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Date of birth" type="date" value={form.birth_date} onChange={e => setForm(f => ({ ...f, birth_date: e.target.value }))} />
          <Select label="Sex" value={form.sex} onChange={sel('sex')} options={[
            { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }
          ]} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Height" type="number" step="0.1" value={form.height_value} onChange={num('height_value')} />
          <Select label="Unit" value={form.height_unit} onChange={sel('height_unit')} options={[
            { value: 'ft', label: 'ft (feet)' }, { value: 'cm', label: 'cm' }
          ]} />
        </div>
        <Select
          label="Daily movement (excl. workouts)"
          value={form.activity_level === 'active' || form.activity_level === 'very_active' ? 'moderate' : form.activity_level}
          onChange={sel('activity_level')}
          options={[
            { value: 'sedentary', label: 'Sedentary — desk all day, minimal walking (+0 kcal)' },
            { value: 'light',     label: 'Light — some walking, ~5–8k steps/day (+200 kcal)' },
            { value: 'moderate',  label: 'Active — 10k+ steps, active commute (+400 kcal)' },
          ]}
        />
        <p className="text-[11px] text-gray-600">Background NEAT only — logged workouts add on top daily</p>
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Calorie Target</p>
          {form.tdee_estimate && (
            <span className="text-[10px] text-gray-600">auto-calculated</span>
          )}
        </div>
        <Select label="Goal" value={form.weight_goal_type} onChange={handleGoalChange} options={[
          { value: 'lose',            label: '⬇⬇ Cut  (−500 kcal/day · ~1 lb/week)' },
          { value: 'lose_mild',       label: '⬇ Mild cut  (−250 kcal/day · ~0.5 lb/week)' },
          { value: 'maintain',        label: '→ Maintain' },
          { value: 'gain',            label: '⬆ Lean gain  (+250 kcal/day)' },
          { value: 'gain_aggressive', label: '⬆⬆ Bulk  (+500 kcal/day)' },
        ]} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Sedentary TDEE (kcal)" type="number" value={form.tdee_estimate} onChange={num('tdee_estimate')} />
          <Input label="Base daily target (kcal)" type="number" value={form.calorie_target} onChange={num('calorie_target')} />
        </div>
        {form.tdee_estimate && form.calorie_target && (() => {
          const sedTdee = Number(form.tdee_estimate);
          const neatOff = NEAT_OFFSET[form.activity_level] ?? 0;
          const base = sedTdee + neatOff;
          const target = Number(form.calorie_target);
          const diff = target - base;
          return (
            <div className="space-y-1">
              {neatOff > 0 && (
                <p className="text-[11px] text-gray-600">
                  {sedTdee} sedentary + {neatOff} NEAT = {base} kcal base
                </p>
              )}
              <p className="text-xs text-gray-500">
                {diff < 0
                  ? `${Math.abs(diff)} kcal/day deficit · ~${(Math.abs(diff) * 7 / 3500).toFixed(1)} lb/week`
                  : diff > 0
                  ? `${diff} kcal/day surplus`
                  : 'Maintenance'}
              </p>
            </div>
          );
        })()}
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Tracked Macros</p>
            <p className="text-[10px] text-gray-600 mt-0.5">Check to show on dashboard · set a target to see progress bars</p>
          </div>
          <button onClick={handleAutoFill} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 shrink-0">
            <Calculator size={12} /> Auto-fill
          </button>
        </div>

        <div className="space-y-1">
          {MACRO_CONFIG.map(macro => {
            const isTracked = trackedMacros.includes(macro.key);
            const targetFieldKey = macro.targetKey as keyof typeof form | null;
            const hasTarget = targetFieldKey !== null;
            const currentTarget = targetFieldKey ? form[targetFieldKey] : '';
            return (
              <div key={macro.key}
                className={`flex items-center gap-2 rounded-xl px-3 py-2 transition-colors ${isTracked ? 'bg-gray-800/60' : 'opacity-50 hover:opacity-70'}`}>
                {/* Checkbox */}
                <input
                  type="checkbox"
                  checked={isTracked}
                  onChange={() => toggleMacro(macro.key)}
                  className="w-3.5 h-3.5 rounded accent-indigo-500 cursor-pointer shrink-0"
                />
                {/* Label */}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-white">{macro.label}</span>
                  {macro.sublabel && (
                    <span className="text-[10px] text-gray-500 ml-1.5">{macro.sublabel}</span>
                  )}
                </div>
                {/* Target input — only shown when checked and macro has a target */}
                {isTracked && hasTarget && targetFieldKey && (
                  <MacroTargetInput
                    value={currentTarget}
                    onChange={v => setForm(f => ({ ...f, [targetFieldKey]: v }))}
                    max={macro.inputMax}
                    step={macro.inputStep}
                    unit={macro.unit}
                  />
                )}
                {/* Informational only (no target) */}
                {isTracked && !hasTarget && (
                  <span className="text-[10px] text-gray-600 italic shrink-0">tracked only</span>
                )}
                {/* Not tracked */}
                {!isTracked && (
                  <span className="text-[10px] text-gray-700 shrink-0">{macro.unit}</span>
                )}
              </div>
            );
          })}
        </div>

        {/* Kcal accounting for core macros */}
        {form.calorie_target && (
          <p className="text-[11px] text-gray-600 pt-1">
            {Math.round(Number(form.protein_target_g) * 4 + Number(form.carbs_target_g) * 4 + Number(form.fat_target_g) * 9)} kcal from macros
            · target: {form.calorie_target} kcal
            {latestWeightKg && ` · ${Math.round(latestWeightKg)} kg`}
          </p>
        )}
      </div>

      <Button onClick={() => onSave({
        birth_date: form.birth_date || undefined,
        sex: form.sex as any || undefined,
        height_value: form.height_value ? Number(form.height_value) : undefined,
        height_unit: form.height_unit as any,
        activity_level: form.activity_level as any,
        calorie_target: form.calorie_target ? Number(form.calorie_target) : undefined,
        tdee_estimate: form.tdee_estimate ? Number(form.tdee_estimate) : undefined,
        protein_target_g:       form.protein_target_g       ? Number(form.protein_target_g)       : undefined,
        carbs_target_g:         form.carbs_target_g         ? Number(form.carbs_target_g)         : undefined,
        fat_target_g:           form.fat_target_g           ? Number(form.fat_target_g)           : undefined,
        fiber_target_g:         form.fiber_target_g         ? Number(form.fiber_target_g)         : undefined,
        added_sugar_target_g:   form.added_sugar_target_g   ? Number(form.added_sugar_target_g)   : undefined,
        saturated_fat_target_g: form.saturated_fat_target_g ? Number(form.saturated_fat_target_g) : undefined,
        sodium_target_mg:       form.sodium_target_mg       ? Number(form.sodium_target_mg)       : undefined,
        cholesterol_target_mg:  form.cholesterol_target_mg  ? Number(form.cholesterol_target_mg)  : undefined,
        potassium_target_mg:    form.potassium_target_mg    ? Number(form.potassium_target_mg)    : undefined,
        // sugar_target_g omitted — no target for natural sugars
        tracked_macros: trackedMacros,
        weight_goal_type: form.weight_goal_type as any,
      })} disabled={saving} className="w-full">
        {saving ? 'Saving…' : 'Save Targets'}
      </Button>
    </div>
  );
}

function WeightTab({ userId, weightLog, user, qc }: { userId: number; weightLog: WeightLog[]; user: User; qc: any }) {
  const [weight, setWeight] = useState('');
  const [unit, setUnit] = useState(user.weight_unit);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const logWeight = useMutation({
    mutationFn: () => api.post(`/users/${userId}/weight-log`, { weight_value: parseFloat(weight), weight_unit: unit }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weight-log', userId] }); setWeight(''); },
  });

  const deleteWeight = useMutation({
    mutationFn: (id: number) => api.delete(`/users/${userId}/weight-log/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weight-log', userId] }); setConfirmDeleteId(null); },
  });

  const chartData = [...weightLog].reverse().map(w => ({
    date: parseSQLiteLocal(w.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: unit === w.weight_unit ? w.weight_value : convertWeight(w.weight_value, w.weight_unit as WeightUnit, unit as WeightUnit),
  }));

  const trend = weightLog.length >= 2
    ? weightLog[0].weight_value - weightLog[weightLog.length - 1].weight_value
    : null;

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400">Log Weight</p>
        <div className="flex gap-2">
          <Input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)}
            placeholder={weightLog[0] ? String(weightLog[0].weight_value) : '0.0'}
            className="flex-1"
            onKeyDown={e => e.key === 'Enter' && weight && logWeight.mutate()}
          />
          <Select value={unit} onChange={e => setUnit(e.target.value as WeightUnit)}
            options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
          <Button onClick={() => logWeight.mutate()} disabled={!weight || logWeight.isPending}>Log</Button>
        </div>
      </div>

      {chartData.length > 1 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <div className="flex items-center justify-between mb-4">
            <p className="text-xs font-semibold text-gray-400">Last 30 days</p>
            {trend !== null && (
              <span className={`text-xs font-medium ${trend < 0 ? 'text-green-400' : trend > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                {trend > 0 ? '+' : ''}{trend.toFixed(1)} {unit}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={chartData}>
              <XAxis dataKey="date" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                formatter={(v: number) => [`${v.toFixed(1)} ${unit}`, 'Weight']} />
              <Line type="monotone" dataKey="weight" stroke="#6366f1" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData.length === 1 && (
        <p className="text-xs text-gray-600 text-center py-2">Log more entries to see your weight trend.</p>
      )}

      {weightLog.length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <p className="text-xs font-semibold text-gray-400 px-4 py-3 border-b border-gray-800">History</p>
          {weightLog.slice(0, 15).map(w => {
            const displayed = unit === w.weight_unit ? w.weight_value : convertWeight(w.weight_value, w.weight_unit as WeightUnit, unit as WeightUnit);
            return (
              <div key={w.id} className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/50 last:border-0">
                <div>
                  <span className="text-sm font-medium text-white">{displayed.toFixed(1)} {unit}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-gray-500">
                    {parseSQLiteLocal(w.logged_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                  </span>
                  {confirmDeleteId === w.id ? (
                    <div className="flex items-center gap-1">
                      <button onClick={() => deleteWeight.mutate(w.id)}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors">
                        Del
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)}
                        className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors">
                        No
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(w.id)}
                      className="p-1 text-gray-700 hover:text-red-400 transition-colors">
                      <Trash2 size={12} />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SettingsTab({ user, onSave, saving }: { user: User; onSave: (d: Partial<User>) => void; saving: boolean }) {
  const [form, setForm] = useState({
    weight_unit: user.weight_unit,
    volume_unit: user.volume_unit,
    length_unit: user.length_unit,
  });
  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Unit Preferences</p>
        <Select label="Weight" value={form.weight_unit}
          onChange={e => setForm(f => ({ ...f, weight_unit: e.target.value as any }))}
          options={[{ value: 'lb', label: 'Pounds (lb)' }, { value: 'kg', label: 'Kilograms (kg)' }]} />
        <Select label="Volume" value={form.volume_unit}
          onChange={e => setForm(f => ({ ...f, volume_unit: e.target.value as any }))}
          options={[{ value: 'oz', label: 'Fluid ounces (oz)' }, { value: 'ml', label: 'Milliliters (ml)' }]} />
        <Select label="Height/Length" value={form.length_unit}
          onChange={e => setForm(f => ({ ...f, length_unit: e.target.value as any }))}
          options={[{ value: 'ft', label: 'Feet/Inches (ft)' }, { value: 'cm', label: 'Centimeters (cm)' }]} />
      </div>
      <Button onClick={() => onSave(form)} disabled={saving} className="w-full">
        {saving ? 'Saving…' : 'Save Settings'}
      </Button>
    </div>
  );
}
