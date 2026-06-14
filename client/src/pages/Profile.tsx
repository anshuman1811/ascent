import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Scale, Target, TrendingDown, Calculator } from 'lucide-react';
import { api } from '../api/client';
import { useAppStore } from '../store/appStore';
import type { User, WeightLog } from '../types';
import { calculateTDEE, ACTIVITY_LABELS } from '../utils/tdee';
import { displayWeight, convertWeight, type WeightUnit } from '../utils/units';
import Button from '../components/ui/Button';
import Input from '../components/ui/Input';
import Select from '../components/ui/Select';
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

function TargetsTab({ user, weightLog, onSave, saving }: { user: User; weightLog: WeightLog[]; onSave: (d: Partial<User>) => void; saving: boolean }) {
  const [form, setForm] = useState({
    birth_date: user.birth_date ?? '',
    sex: user.sex ?? 'male',
    height_value: user.height_value ?? '',
    height_unit: user.height_unit,
    activity_level: user.activity_level,
    calorie_target: user.calorie_target ?? '',
    tdee_estimate: user.tdee_estimate ?? '',
    protein_target_g: user.protein_target_g ?? '',
    carbs_target_g: user.carbs_target_g ?? '',
    fat_target_g: user.fat_target_g ?? '',
    fiber_target_g: user.fiber_target_g ?? '',
    weight_goal_type: user.weight_goal_type,
  });

  const num = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
  const sel = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  function computeTDEE() {
    if (!form.birth_date || !form.height_value) {
      alert('Enter date of birth and height first.');
      return;
    }
    const latestWeight = weightLog[0];
    if (!latestWeight) {
      alert('Log your body weight first (Weight tab), then compute TDEE.');
      return;
    }
    const tdee = calculateTDEE({
      weight_value: latestWeight.weight_value,
      weight_unit: latestWeight.weight_unit as any,
      height_value: Number(form.height_value),
      height_unit: form.height_unit as any,
      birth_date: form.birth_date,
      sex: form.sex as any,
      activity_level: form.activity_level as any,
    });
    setForm(f => ({ ...f, tdee_estimate: String(tdee), calorie_target: String(tdee) }));
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
        <Select label="Activity level" value={form.activity_level} onChange={sel('activity_level')}
          options={Object.entries(ACTIVITY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Calorie Target</p>
          <button onClick={computeTDEE} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
            <Calculator size={12} /> Compute TDEE
          </button>
        </div>
        <Select label="Goal" value={form.weight_goal_type} onChange={sel('weight_goal_type')} options={[
          { value: 'lose', label: '⬇ Lose weight' },
          { value: 'maintain', label: '→ Maintain' },
          { value: 'gain', label: '⬆ Gain weight' },
        ]} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="TDEE estimate (kcal)" type="number" value={form.tdee_estimate} onChange={num('tdee_estimate')} />
          <Input label="Daily calorie target" type="number" value={form.calorie_target} onChange={num('calorie_target')} />
        </div>
        {form.tdee_estimate && form.calorie_target && (
          <p className="text-xs text-gray-500">
            {Number(form.calorie_target) < Number(form.tdee_estimate)
              ? `${Math.round(Number(form.tdee_estimate) - Number(form.calorie_target))} kcal/day deficit (~${((Number(form.tdee_estimate) - Number(form.calorie_target)) * 7 / 3500).toFixed(1)} lb/week loss)`
              : Number(form.calorie_target) > Number(form.tdee_estimate)
              ? `${Math.round(Number(form.calorie_target) - Number(form.tdee_estimate))} kcal/day surplus`
              : 'Maintenance calories'}
          </p>
        )}
      </div>

      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Macro Targets</p>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Protein (g)" type="number" value={form.protein_target_g} onChange={num('protein_target_g')} />
          <Input label="Carbs (g)" type="number" value={form.carbs_target_g} onChange={num('carbs_target_g')} />
          <Input label="Fat (g)" type="number" value={form.fat_target_g} onChange={num('fat_target_g')} />
          <Input label="Fiber (g)" type="number" value={form.fiber_target_g} onChange={num('fiber_target_g')} />
        </div>
      </div>

      <Button onClick={() => onSave({
        birth_date: form.birth_date || undefined,
        sex: form.sex as any || undefined,
        height_value: form.height_value ? Number(form.height_value) : undefined,
        height_unit: form.height_unit as any,
        activity_level: form.activity_level as any,
        calorie_target: form.calorie_target ? Number(form.calorie_target) : undefined,
        tdee_estimate: form.tdee_estimate ? Number(form.tdee_estimate) : undefined,
        protein_target_g: form.protein_target_g ? Number(form.protein_target_g) : undefined,
        carbs_target_g: form.carbs_target_g ? Number(form.carbs_target_g) : undefined,
        fat_target_g: form.fat_target_g ? Number(form.fat_target_g) : undefined,
        fiber_target_g: form.fiber_target_g ? Number(form.fiber_target_g) : undefined,
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

  const logWeight = useMutation({
    mutationFn: () => api.post(`/users/${userId}/weight-log`, { weight_value: parseFloat(weight), weight_unit: unit }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['weight-log', userId] }); setWeight(''); },
  });

  const chartData = [...weightLog].reverse().map(w => ({
    date: new Date(w.logged_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    weight: unit === w.weight_unit ? w.weight_value : convertWeight(w.weight_value, w.weight_unit as WeightUnit, unit as WeightUnit),
  }));

  return (
    <div className="space-y-4">
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400">Log Weight</p>
        <div className="flex gap-2">
          <Input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="0.0" className="flex-1" />
          <Select value={unit} onChange={e => setUnit(e.target.value as WeightUnit)}
            options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
          <Button onClick={() => logWeight.mutate()} disabled={!weight || logWeight.isPending}>Log</Button>
        </div>
        {weightLog[0] && (
          <p className="text-xs text-gray-500">
            Last: {displayWeight(weightLog[0].weight_value, weightLog[0].weight_unit as WeightUnit)}
            {' '}· {new Date(weightLog[0].logged_at).toLocaleDateString()}
          </p>
        )}
      </div>

      {chartData.length > 1 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <p className="text-xs font-semibold text-gray-400 mb-4">Last 30 days</p>
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
