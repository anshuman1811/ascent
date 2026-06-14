import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, GripVertical, Timer, BarChart2, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import type { Routine, Exercise } from '../../types';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import MuscleMap, { MuscleMapLegend } from '../../components/ui/MuscleMap';

interface OutletCtx { userId: number; }

function buildMuscleCounts(routine: Routine) {
  const pc: Record<string, number> = {};
  const sc: Record<string, number> = {};
  for (const ex of routine.exercises) {
    for (const m of ex.primary_muscles)   pc[m] = (pc[m] ?? 0) + 1;
    for (const m of ex.secondary_muscles) sc[m] = (sc[m] ?? 0) + 1;
  }
  return { pc, sc };
}

export default function RoutineBuilder({ userId: propUserId }: { userId?: number }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;
  const qc = useQueryClient();

  const [showAdd, setShowAdd] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [addExerciseTo, setAddExerciseTo] = useState<number | null>(null);

  const { data: routines = [] } = useQuery({
    queryKey: ['routines', userId],
    queryFn: () => api.get<Routine[]>(`/routines/user/${userId}`),
    enabled: !!userId,
  });

  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises', ''],
    queryFn: () => api.get<Exercise[]>('/exercises'),
  });

  const createRoutine = useMutation({
    mutationFn: (name: string) => api.post('/routines', { user_id: userId, name }),
    onSuccess: (r: any) => {
      qc.invalidateQueries({ queryKey: ['routines', userId] });
      setShowAdd(false);
      setExpanded(prev => new Set([...prev, r.id]));
    },
  });

  const deleteRoutine = useMutation({
    mutationFn: (id: number) => api.delete(`/routines/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines', userId] }),
  });

  const deleteRoutineEx = useMutation({
    mutationFn: (reId: number) => api.delete(`/routines/exercises/${reId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routines', userId] }),
  });

  const toggle = (id: number) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Routines</h1>
          <p className="text-xs text-gray-500 mt-0.5">{routines.length} routines</p>
        </div>
        <Button onClick={() => setShowAdd(true)} size="sm"><Plus size={14} /> New Routine</Button>
      </div>

      {routines.length === 0 && (
        <div className="text-center py-12 text-gray-600">
          <p className="text-sm">No routines yet.</p>
          <p className="text-xs mt-1">Create a routine to plan your workouts.</p>
        </div>
      )}

      {routines.map(routine => (
        <div key={routine.id} className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <button onClick={() => toggle(routine.id)} className="w-full flex items-center justify-between p-4 text-left">
            <div>
              <p className="text-sm font-semibold text-white">{routine.name}</p>
              <p className="text-xs text-gray-500">{routine.exercises.length} exercises</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={e => { e.stopPropagation(); if (confirm(`Delete "${routine.name}"?`)) deleteRoutine.mutate(routine.id); }}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-600 hover:text-red-400 transition-colors">
                <Trash2 size={14} />
              </button>
              {expanded.has(routine.id) ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
            </div>
          </button>

          {expanded.has(routine.id) && (() => {
            const { pc, sc } = buildMuscleCounts(routine);
            const hasAnyMuscle = Object.keys(pc).length > 0 || Object.keys(sc).length > 0;
            return (
              <div className="border-t border-gray-800">
                {routine.exercises.map((re, idx) => (
                  <div key={re.id} className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/50 last:border-0">
                    <GripVertical size={14} className="text-gray-700 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-600 w-4">{idx + 1}.</span>
                        <p className="text-sm font-medium text-white truncate">{re.exercise_name}</p>
                        {re.exercise_type === 'timed'
                          ? <Timer size={11} className="text-purple-400 shrink-0" />
                          : <BarChart2 size={11} className="text-blue-400 shrink-0" />}
                      </div>
                      <p className="text-xs text-gray-500 ml-5">
                        {re.sets} sets ·{' '}
                        {re.exercise_type === 'timed'
                          ? `${re.duration_seconds}s`
                          : `${re.reps} reps`}
                        {re.weight_value ? ` @ ${re.weight_value}${re.weight_unit}` : ''}
                        {' · '}{re.rest_seconds}s rest
                      </p>
                    </div>
                    <button onClick={() => deleteRoutineEx.mutate(re.id)}
                      className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-600 hover:text-red-400 transition-colors shrink-0">
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}

                {hasAnyMuscle && (
                  <div className="px-4 py-4 border-b border-gray-800/50">
                    <p className="text-xs font-medium text-gray-500 mb-3 text-center uppercase tracking-wider">Muscle Coverage</p>
                    <MuscleMap primaryCounts={pc} secondaryCounts={sc} className="w-56 mx-auto" />
                    <div className="mt-2">
                      <MuscleMapLegend mode="routine" />
                    </div>
                  </div>
                )}

                <div className="p-3">
                  <Button size="sm" variant="secondary" className="w-full" onClick={() => setAddExerciseTo(routine.id)}>
                    <Plus size={13} /> Add Exercise
                  </Button>
                </div>
              </div>
            );
          })()}
        </div>
      ))}

      {/* New routine modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="New Routine" size="sm">
        <NewRoutineForm onCreate={name => createRoutine.mutate(name)} loading={createRoutine.isPending} />
      </Modal>

      {/* Add exercise to routine modal */}
      {addExerciseTo && (
        <AddExerciseToRoutineModal
          open
          routineId={addExerciseTo}
          exercises={exercises}
          onClose={() => setAddExerciseTo(null)}
          onAdded={() => { qc.invalidateQueries({ queryKey: ['routines', userId] }); setAddExerciseTo(null); }}
        />
      )}
    </div>
  );
}

function NewRoutineForm({ onCreate, loading }: { onCreate: (name: string) => void; loading: boolean }) {
  const [name, setName] = useState('');
  return (
    <div className="space-y-4">
      <Input label="Routine name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Push Day, Full Body…" autoFocus />
      <Button onClick={() => onCreate(name)} disabled={!name || loading} className="w-full">
        {loading ? 'Creating…' : 'Create Routine'}
      </Button>
    </div>
  );
}

function AddExerciseToRoutineModal({ open, routineId, exercises, onClose, onAdded }: {
  open: boolean; routineId: number; exercises: Exercise[];
  onClose: () => void; onAdded: () => void;
}) {
  const [form, setForm] = useState({
    exercise_id: exercises[0]?.id ?? 0,
    sets: 3, reps: 8, duration_seconds: 30,
    weight_value: '', weight_unit: 'lb', rest_seconds: 90,
  });

  const selectedEx = exercises.find(e => e.id === Number(form.exercise_id));

  const add = useMutation({
    mutationFn: () => api.post(`/routines/${routineId}/exercises`, {
      exercise_id: Number(form.exercise_id),
      sets: form.sets,
      reps: selectedEx?.exercise_type === 'reps' ? form.reps : undefined,
      duration_seconds: selectedEx?.exercise_type === 'timed' ? form.duration_seconds : undefined,
      weight_value: form.weight_value ? parseFloat(form.weight_value) : undefined,
      weight_unit: form.weight_unit,
      rest_seconds: form.rest_seconds,
    }),
    onSuccess: onAdded,
  });

  return (
    <Modal open={open} onClose={onClose} title="Add Exercise to Routine" size="md">
      <div className="space-y-3">
        <Select
          label="Exercise"
          value={form.exercise_id}
          onChange={e => setForm(f => ({ ...f, exercise_id: Number(e.target.value) }))}
          options={exercises.map(e => ({ value: e.id, label: e.name }))}
        />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Sets" type="number" value={form.sets} onChange={e => setForm(f => ({ ...f, sets: parseInt(e.target.value) || 3 }))} />
          {selectedEx?.exercise_type === 'timed'
            ? <Input label="Duration (s)" type="number" value={form.duration_seconds} onChange={e => setForm(f => ({ ...f, duration_seconds: parseInt(e.target.value) || 30 }))} />
            : <Input label="Reps" type="number" value={form.reps} onChange={e => setForm(f => ({ ...f, reps: parseInt(e.target.value) || 8 }))} />}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Weight (optional)" type="number" value={form.weight_value} onChange={e => setForm(f => ({ ...f, weight_value: e.target.value }))} placeholder="0" />
          <Select label="Unit" value={form.weight_unit} onChange={e => setForm(f => ({ ...f, weight_unit: e.target.value }))}
            options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
        </div>
        <Input label="Rest (seconds)" type="number" value={form.rest_seconds} onChange={e => setForm(f => ({ ...f, rest_seconds: parseInt(e.target.value) || 90 }))} />
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => add.mutate()} disabled={!form.exercise_id || add.isPending} className="flex-1">
            {add.isPending ? 'Adding…' : 'Add Exercise'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
