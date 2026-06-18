import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { Plus, Trash2, GripVertical, Timer, BarChart2, ChevronDown, ChevronUp, Search, X } from 'lucide-react';
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
  const [expandedEx, setExpandedEx] = useState<Set<number>>(new Set());
  const [addExerciseTo, setAddExerciseTo] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [confirmDeleteReId, setConfirmDeleteReId] = useState<number | null>(null);

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

  const toggleEx = (reId: number) => setExpandedEx(prev => {
    const next = new Set(prev);
    next.has(reId) ? next.delete(reId) : next.add(reId);
    return next;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Routines</h1>
          <p className="text-xs text-gray-500 mt-0.5">{routines.length} routine{routines.length !== 1 ? 's' : ''}</p>
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
          <div className="w-full flex items-center justify-between p-4">
            <button onClick={() => toggle(routine.id)} className="flex-1 text-left min-w-0 mr-2">
              <p className="text-sm font-semibold text-white">{routine.name}</p>
              <p className="text-xs text-gray-500">{routine.exercises.length} exercise{routine.exercises.length !== 1 ? 's' : ''}</p>
            </button>
            <div className="flex items-center gap-2 shrink-0">
              {confirmDeleteId === routine.id ? (
                <>
                  <span className="text-xs text-gray-400">Remove?</span>
                  <button onClick={() => { deleteRoutine.mutate(routine.id); setConfirmDeleteId(null); }}
                    className="text-xs px-2 py-1 rounded-lg bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors">
                    Yes
                  </button>
                  <button onClick={() => setConfirmDeleteId(null)}
                    className="text-xs px-2 py-1 rounded-lg bg-gray-800 text-gray-400 hover:text-white transition-colors">
                    No
                  </button>
                </>
              ) : (
                <button onClick={() => setConfirmDeleteId(routine.id)}
                  className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-600 hover:text-red-400 transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
              <button onClick={() => toggle(routine.id)} className="p-0.5">
                {expanded.has(routine.id) ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
              </button>
            </div>
          </div>

          {expanded.has(routine.id) && (() => {
            const { pc, sc } = buildMuscleCounts(routine);
            const hasAnyMuscle = Object.keys(pc).length > 0 || Object.keys(sc).length > 0;
            return (
              <div className="border-t border-gray-800">
                {routine.exercises.map((re, idx) => (
                  <div key={re.id} className="border-b border-gray-800/50 last:border-0">
                    <div className="flex items-center gap-3 px-4 py-3">
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
                          {re.weight_value ? ` @ ${re.weight_value} ${re.weight_unit}` : ''}
                          {' · '}{re.rest_seconds}s rest
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {confirmDeleteReId === re.id ? (
                          <>
                            <button onClick={() => { deleteRoutineEx.mutate(re.id); setConfirmDeleteReId(null); }}
                              className="text-[11px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors">
                              Del
                            </button>
                            <button onClick={() => setConfirmDeleteReId(null)}
                              className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors">
                              No
                            </button>
                          </>
                        ) : (
                          <button onClick={() => setConfirmDeleteReId(re.id)}
                            className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-600 hover:text-red-400 transition-colors">
                            <Trash2 size={13} />
                          </button>
                        )}
                        <button onClick={() => toggleEx(re.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-600 hover:text-gray-300 transition-colors">
                          {expandedEx.has(re.id)
                            ? <ChevronUp size={13} />
                            : <ChevronDown size={13} />}
                        </button>
                      </div>
                    </div>
                    {expandedEx.has(re.id) && (
                      <div className="px-4 pb-4 space-y-3 bg-gray-950/40">
                        {re.gif_url && (
                          <div className="flex justify-center pt-2">
                            <img
                              src={re.gif_url}
                              alt={re.exercise_name}
                              className="h-28 w-auto rounded-xl object-contain"
                            />
                          </div>
                        )}
                        {re.description && (
                          <p className="text-xs text-gray-400 leading-relaxed">{re.description}</p>
                        )}
                        {re.exercise_notes && (
                          <p className="text-xs text-indigo-400/80 leading-relaxed italic">{re.exercise_notes}</p>
                        )}
                        {(re.primary_muscles.length > 0 || re.secondary_muscles.length > 0) && (
                          <div>
                            {re.primary_muscles.length > 0 && (
                              <p className="text-[11px] text-gray-500">
                                <span className="text-gray-400 font-medium">Primary: </span>
                                {re.primary_muscles.join(', ')}
                              </p>
                            )}
                            {re.secondary_muscles.length > 0 && (
                              <p className="text-[11px] text-gray-500 mt-0.5">
                                <span className="text-gray-400 font-medium">Secondary: </span>
                                {re.secondary_muscles.join(', ')}
                              </p>
                            )}
                          </div>
                        )}
                        {!re.gif_url && !re.description && !re.exercise_notes && re.primary_muscles.length === 0 && (
                          <p className="text-xs text-gray-600 text-center py-1">No additional details available.</p>
                        )}
                      </div>
                    )}
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
      <Input label="Routine name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Push Day, Full Body…" autoFocus
        onKeyDown={e => e.key === 'Enter' && name && !loading && onCreate(name)} />
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
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedExId, setSelectedExId] = useState<number | null>(exercises[0]?.id ?? null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'reps' | 'timed'>('reps');
  const [form, setForm] = useState({
    sets: 3, reps: 8, duration_seconds: 30,
    weight_value: '', weight_unit: 'lb', rest_seconds: 90,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? exercises.filter(e => e.name.toLowerCase().includes(q)) : exercises;
  }, [exercises, search]);

  const selectedEx = exercises.find(e => e.id === selectedExId);

  const createExercise = useMutation({
    mutationFn: () => api.post<Exercise>('/exercises', {
      name: newName.trim(),
      exercise_type: newType,
      category: 'strength',
      primary_muscles: [],
      secondary_muscles: [],
    }),
    onSuccess: (created: Exercise) => {
      qc.invalidateQueries({ queryKey: ['exercises'] });
      setSelectedExId(created.id);
      setShowCreate(false);
      setSearch('');
      setNewName('');
    },
  });

  const add = useMutation({
    mutationFn: () => api.post(`/routines/${routineId}/exercises`, {
      exercise_id: selectedExId,
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
        {/* Exercise picker */}
        <div>
          <p className="text-xs font-medium text-gray-400 mb-1.5">Exercise</p>

          {/* Search */}
          <div className="relative mb-2">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search exercises…"
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-7 pr-8 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={13} />
              </button>
            )}
          </div>

          {/* Results list */}
          <div className="max-h-36 overflow-y-auto rounded-lg border border-gray-800 bg-gray-900 hide-scrollbar">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-500 text-center py-3">No exercises found</p>
            ) : (
              filtered.map(ex => (
                <button
                  key={ex.id}
                  onClick={() => { setSelectedExId(ex.id); setShowCreate(false); }}
                  className={`w-full flex items-center justify-between px-3 py-2 text-left text-sm transition-colors border-b border-gray-800 last:border-0 ${
                    selectedExId === ex.id
                      ? 'bg-indigo-600/20 text-indigo-300'
                      : 'text-gray-300 hover:bg-gray-800'
                  }`}
                >
                  <span className="truncate">{ex.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] text-gray-500">
                    {ex.exercise_type === 'timed' ? 'timed' : 'reps'}
                  </span>
                </button>
              ))
            )}
          </div>

          {/* Create new inline */}
          {!showCreate ? (
            <button
              onClick={() => { setShowCreate(true); setNewName(search); }}
              className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-gray-700 text-xs text-indigo-400 hover:border-indigo-600 hover:bg-indigo-950/30 transition-colors"
            >
              <Plus size={12} /> Create new exercise{search ? ` "${search}"` : ''}
            </button>
          ) : (
            <div className="mt-2 p-3 rounded-lg border border-indigo-800/50 bg-indigo-950/20 space-y-2">
              <p className="text-xs font-medium text-indigo-300">New exercise</p>
              <Input
                label="Name"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="e.g. Bulgarian Split Squat"
                autoFocus
                onKeyDown={e => { if (e.key === 'Enter' && newName.trim() && !createExercise.isPending) createExercise.mutate(); }}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => setNewType('reps')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${newType === 'reps' ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                >
                  Reps-based
                </button>
                <button
                  onClick={() => setNewType('timed')}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors ${newType === 'timed' ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}
                >
                  Timed
                </button>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setShowCreate(false)} className="flex-1">Cancel</Button>
                <Button
                  size="sm"
                  onClick={() => createExercise.mutate()}
                  disabled={!newName.trim() || createExercise.isPending}
                  className="flex-1"
                >
                  {createExercise.isPending ? 'Creating…' : 'Create & Select'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Sets / reps / weight — only shown when an exercise is selected */}
        {selectedEx && !showCreate && (
          <>
            <div className="pt-1 border-t border-gray-800">
              <p className="text-xs text-gray-500 mb-2">
                Selected: <span className="text-white font-medium">{selectedEx.name}</span>
                <span className="ml-1 text-gray-600">({selectedEx.exercise_type})</span>
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Sets" type="number" value={form.sets} onChange={e => setForm(f => ({ ...f, sets: parseInt(e.target.value) || 3 }))} />
              {selectedEx.exercise_type === 'timed'
                ? <Input label="Duration (s)" type="number" value={form.duration_seconds} onChange={e => setForm(f => ({ ...f, duration_seconds: parseInt(e.target.value) || 30 }))} />
                : <Input label="Reps" type="number" value={form.reps} onChange={e => setForm(f => ({ ...f, reps: parseInt(e.target.value) || 8 }))} />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input label="Weight (optional)" type="number" value={form.weight_value} onChange={e => setForm(f => ({ ...f, weight_value: e.target.value }))} placeholder="0" />
              <Select label="Unit" value={form.weight_unit} onChange={e => setForm(f => ({ ...f, weight_unit: e.target.value }))}
                options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
            </div>
            <Input label="Rest (seconds)" type="number" value={form.rest_seconds} onChange={e => setForm(f => ({ ...f, rest_seconds: parseInt(e.target.value) || 90 }))}
              onKeyDown={e => { if (e.key === 'Enter' && selectedExId && !add.isPending) add.mutate(); }} />
          </>
        )}

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => add.mutate()} disabled={!selectedExId || showCreate || add.isPending} className="flex-1">
            {add.isPending ? 'Adding…' : 'Add Exercise'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
