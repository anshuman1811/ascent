import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useToast } from '../../components/ui/Toast';
import { Search, Plus, Edit2, Trash2, Timer, BarChart2, ChevronDown } from 'lucide-react';
import { api } from '../../api/client';
import type { Exercise, ExerciseCategory } from '../../types';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import MuscleMap, { MuscleMapLegend } from '../../components/ui/MuscleMap';
import ExerciseAnimation from '../../components/ui/ExerciseAnimation';

const MUSCLES = [
  'chest','upper_back','lats','lower_back','shoulders','rear_delts',
  'biceps','triceps','forearms','core','quads','hamstrings',
  'glutes','calves','hip_flexor','rotator_cuff',
];

const MUSCLE_LABELS: Record<string, string> = {
  chest:'Chest', upper_back:'Upper Back', lats:'Lats', lower_back:'Lower Back',
  shoulders:'Shoulders', rear_delts:'Rear Delts', biceps:'Biceps', triceps:'Triceps',
  forearms:'Forearms', core:'Core', quads:'Quads', hamstrings:'Hamstrings',
  glutes:'Glutes', calves:'Calves', hip_flexor:'Hip Flexor', rotator_cuff:'Rotator Cuff',
};

const CATEGORIES: { value: ExerciseCategory | 'all'; label: string }[] = [
  { value: 'all',      label: 'All'      },
  { value: 'strength', label: 'Strength' },
  { value: 'cardio',   label: 'Cardio'   },
  { value: 'warmup',   label: 'Warmup'   },
  { value: 'cooldown', label: 'Cooldown' },
];

const CATEGORY_COLORS: Record<string, string> = {
  strength: 'bg-blue-900/50 text-blue-400',
  cardio:   'bg-orange-900/50 text-orange-400',
  warmup:   'bg-green-900/50 text-green-400',
  cooldown: 'bg-purple-900/50 text-purple-400',
};

export default function ExerciseLibrary() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<ExerciseCategory | 'all'>('all');
  const [editEx, setEditEx] = useState<Exercise | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedMuscles, setExpandedMuscles] = useState<Set<number>>(new Set());
  const toggleMuscles = (id: number) => setExpandedMuscles(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const [confirmExId, setConfirmExId] = useState<number | null>(null);

  const { data: allExercises = [], isLoading } = useQuery({
    queryKey: ['exercises', search],
    queryFn: () => api.get<Exercise[]>(`/exercises?search=${encodeURIComponent(search)}`),
  });

  const exercises = category === 'all' ? allExercises : allExercises.filter(e => e.category === category);

  const deleteEx = useMutation({
    mutationFn: (id: number) => api.delete(`/exercises/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exercises'] }),
    onError: (err: Error) => toast(err.message, 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Exercise Library</h1>
          <p className="text-xs text-gray-500 mt-0.5">{exercises.length} exercise{exercises.length !== 1 ? 's' : ''}</p>
        </div>
        <Button onClick={() => setShowAdd(true)} size="sm">
          <Plus size={14} /> Add Exercise
        </Button>
      </div>

      {/* Category filter */}
      <div className="flex gap-1.5 overflow-x-auto hide-scrollbar pb-0.5">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              category === c.value
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
          placeholder="Search exercises…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <div className="text-center py-8 text-gray-600 text-sm">Loading…</div>}

      <div className="space-y-2">
        {exercises.map(ex => {
          const hasMuscles = ex.primary_muscles.length > 0 || ex.secondary_muscles.length > 0;
          const expanded = expandedMuscles.has(ex.id);
          const hasVisuals = !!ex.gif_url || hasMuscles;
          return (
            <div key={ex.id} className="bg-gray-900 rounded-xl border border-gray-800 p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-medium text-white">{ex.name}</p>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${CATEGORY_COLORS[ex.category] ?? 'bg-gray-800 text-gray-400'}`}>
                      {ex.category}
                    </span>
                    <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium
                      ${ex.exercise_type === 'timed' ? 'bg-purple-900/30 text-purple-400' : 'bg-gray-800/80 text-gray-500'}`}>
                      {ex.exercise_type === 'timed' ? <Timer size={9} /> : <BarChart2 size={9} />}
                      {ex.exercise_type}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {ex.primary_muscles.map(m => (
                      <span key={m} className="text-[10px] px-1.5 py-0.5 bg-red-900/30 text-red-400 rounded">
                        {MUSCLE_LABELS[m] ?? m}
                      </span>
                    ))}
                    {ex.secondary_muscles.map(m => (
                      <span key={m} className="text-[10px] px-1.5 py-0.5 bg-orange-900/20 text-orange-400 rounded">
                        {MUSCLE_LABELS[m] ?? m}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {hasVisuals && (
                    <button
                      onClick={() => toggleMuscles(ex.id)}
                      title="Toggle visuals"
                      className={`p-2 rounded-lg transition-colors text-gray-500 hover:text-white ${expanded ? 'bg-gray-800 text-white' : 'hover:bg-gray-800'}`}
                    >
                      <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                    </button>
                  )}
                  <button onClick={() => setEditEx(ex)} className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white transition-colors">
                    <Edit2 size={14} />
                  </button>
                  {confirmExId === ex.id ? (
                    <>
                      <span className="text-xs text-gray-400 ml-1">Delete?</span>
                      <button
                        onClick={() => { deleteEx.mutate(ex.id); setConfirmExId(null); }}
                        className="text-xs px-2 py-1 rounded-lg bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmExId(null)}
                        className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors"
                      >
                        No
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setConfirmExId(ex.id)}
                      className="p-2 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* Animation + muscle map side by side */}
              {expanded && hasVisuals && (
                <div className="mt-3 pt-3 border-t border-gray-800 flex flex-col sm:flex-row gap-3 items-start">
                  {ex.gif_url && (
                    <div className="w-full sm:flex-1 rounded-lg overflow-hidden bg-gray-800/60">
                      <ExerciseAnimation
                        gifUrl={ex.gif_url}
                        name={ex.name}
                        className="w-full"
                      />
                    </div>
                  )}
                  {hasMuscles && (
                    <div className="flex flex-col items-center gap-1.5 sm:w-40 w-full">
                      <MuscleMap
                        primary={ex.primary_muscles}
                        secondary={ex.secondary_muscles}
                        className="w-36"
                      />
                      <MuscleMapLegend mode="exercise" />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <ExerciseFormModal
        open={showAdd || !!editEx}
        exercise={editEx}
        onClose={() => { setShowAdd(false); setEditEx(null); }}
        onSaved={() => { qc.invalidateQueries({ queryKey: ['exercises'] }); setShowAdd(false); setEditEx(null); }}
      />
    </div>
  );
}

function ExerciseFormModal({ open, exercise, onClose, onSaved }: {
  open: boolean; exercise: Exercise | null; onClose: () => void; onSaved: () => void;
}) {
  type FormState = { name: string; exercise_type: 'reps' | 'timed'; category: ExerciseCategory; primary_muscles: string[]; secondary_muscles: string[]; met_value: number; notes: string; description: string; gif_url: string };
  const blank: FormState = { name: '', exercise_type: 'reps', category: 'strength', primary_muscles: [], secondary_muscles: [], met_value: 4.0, notes: '', description: '', gif_url: '' };
  const [form, setForm] = useState<FormState>(exercise ? { ...blank, ...exercise, description: exercise.description ?? '', gif_url: exercise.gif_url ?? '' } : blank);

  const save = useMutation({
    mutationFn: () => exercise ? api.put(`/exercises/${exercise.id}`, { ...form, description: form.description || null, gif_url: form.gif_url || null }) : api.post('/exercises', { ...form, description: form.description || null, gif_url: form.gif_url || null }),
    onSuccess: onSaved,
  });

  const toggleMuscle = (list: 'primary_muscles' | 'secondary_muscles', muscle: string) => {
    setForm(f => ({
      ...f,
      [list]: f[list].includes(muscle) ? f[list].filter(m => m !== muscle) : [...f[list], muscle],
    }));
  };

  return (
    <Modal open={open} onClose={onClose} title={exercise ? 'Edit Exercise' : 'Add Exercise'} size="lg">
      <div className="space-y-4">
        <Input label="Exercise name *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter' && form.name && !save.isPending) save.mutate(); }} />
        <Select
          label="Category"
          value={form.category}
          onChange={e => setForm(f => ({ ...f, category: e.target.value as ExerciseCategory }))}
          options={CATEGORIES.filter(c => c.value !== 'all').map(c => ({ value: c.value, label: c.label }))}
        />
        <Select
          label="Execution type"
          value={form.exercise_type}
          onChange={e => setForm(f => ({ ...f, exercise_type: e.target.value as 'reps' | 'timed' }))}
          options={[{ value: 'reps', label: 'Rep-based (weights, bodyweight)' }, { value: 'timed', label: 'Timed (plank, running, stretches)' }]}
        />
        <Input label="MET value (for calorie estimate)" type="number" step="0.5" value={form.met_value}
          onChange={e => setForm(f => ({ ...f, met_value: parseFloat(e.target.value) || 4 }))} />

        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">Primary muscles</p>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.map(m => (
              <button key={m} type="button"
                onClick={() => toggleMuscle('primary_muscles', m)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  form.primary_muscles.includes(m) ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {MUSCLE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-400">Secondary muscles</p>
          <div className="flex flex-wrap gap-1.5">
            {MUSCLES.map(m => (
              <button key={m} type="button"
                onClick={() => toggleMuscle('secondary_muscles', m)}
                className={`text-xs px-2.5 py-1 rounded-full transition-colors ${
                  form.secondary_muscles.includes(m) ? 'bg-orange-700/60 text-orange-300' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {MUSCLE_LABELS[m]}
              </button>
            ))}
          </div>
        </div>

        {(form.primary_muscles.length > 0 || form.secondary_muscles.length > 0) && (
          <div className="bg-gray-800/40 rounded-xl p-3 space-y-2">
            <p className="text-xs font-medium text-gray-400 text-center">Muscle Activation Preview</p>
            <MuscleMap
              primary={form.primary_muscles}
              secondary={form.secondary_muscles}
              className="w-48 mx-auto"
            />
            <MuscleMapLegend mode="exercise" />
          </div>
        )}

        <div className="space-y-1.5">
          <p className="text-xs font-medium text-gray-400">Technique description</p>
          <textarea
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="Describe setup, cues, and common mistakes. Use ⚠️ for warnings and 💡 for tips."
            rows={5}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 resize-none leading-relaxed"
          />
        </div>

        <Input
          label="Animation GIF URL (optional)"
          value={form.gif_url}
          onChange={e => setForm(f => ({ ...f, gif_url: e.target.value }))}
          placeholder="https://..."
        />

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={!form.name || save.isPending} className="flex-1">
            {save.isPending ? 'Saving…' : exercise ? 'Save Changes' : 'Add Exercise'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
