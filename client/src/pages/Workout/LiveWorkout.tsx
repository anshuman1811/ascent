import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, SkipForward, X, Trophy, Timer, Dumbbell, Clock, Plus } from 'lucide-react';
import { api } from '../../api/client';
import { useAppStore, useWorkoutStore } from '../../store/appStore';
import type { WorkoutSession, SessionExercise, Exercise } from '../../types';
import { formatDuration } from '../../utils/units';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';

interface OutletCtx { userId: number; }

export default function LiveWorkout({ userId: propUserId }: { userId?: number }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;
  const { sessionId: paramId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { restSecondsLeft, restRunning, elapsedSeconds, startRest, tickRest, stopRest, tickElapsed, clearSession } = useWorkoutStore();

  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [addExOpen, setAddExOpen] = useState(false);
  // Elapsed seconds derived from session.started_at so it survives page refresh
  const [elapsed, setElapsed] = useState(0);

  const { data: session, refetch } = useQuery({
    queryKey: ['session', paramId],
    queryFn: () => api.get<WorkoutSession>(`/workouts/${paramId}`),
    enabled: !!paramId,
    refetchInterval: false,
  });

  // Drive elapsed from DB-persisted started_at, not in-memory store
  useEffect(() => {
    if (!session) return;
    const tick = () => {
      setElapsed(Math.floor((Date.now() - new Date(session.started_at).getTime()) / 1000));
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [session?.started_at]);

  // Rest countdown
  useEffect(() => {
    if (!restRunning) return;
    const t = setInterval(tickRest, 1000);
    return () => clearInterval(t);
  }, [restRunning, tickRest]);

  const logSet = useMutation({
    mutationFn: (data: { seId: number; reps?: number; duration?: number; weight?: number; weightUnit: string }) =>
      api.post(`/workouts/session-exercises/${data.seId}/sets`, {
        actual_reps: data.reps,
        actual_duration_seconds: data.duration,
        actual_weight_value: data.weight,
        actual_weight_unit: data.weightUnit,
      }),
    onSuccess: () => refetch(),
  });

  const completeSession = useMutation({
    mutationFn: () => api.put(`/workouts/${paramId}/finish`, { total_rest_seconds: elapsed }),
    onSuccess: () => {
      clearSession();
      qc.invalidateQueries({ queryKey: ['active-session', userId] });
      navigate(`/workout`);
    },
  });

  const abandonSession = useMutation({
    mutationFn: () => api.put(`/workouts/${paramId}/abandon`, {}),
    onSuccess: () => { clearSession(); navigate('/workout'); },
  });

  if (!session) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading…</div>;

  const exercises = session.exercises;
  const currentEx = exercises[currentExIdx];
  const completedSets = currentEx?.sets.length ?? 0;
  const totalSets = currentEx?.target_sets ?? 0;
  const allDone = exercises.every(ex => ex.status === 'completed' || ex.status === 'skipped');

  const prevSet = currentEx?.sets[currentEx.sets.length - 1];

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-800">
        <div>
          <p className="text-xs text-gray-500">Workout</p>
          <p className="text-sm font-semibold text-white">{session.name}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <Clock size={12} />
            <span>{formatDuration(elapsed)}</span>
          </div>
          <button
            onClick={() => { if (confirm('Abandon workout?')) abandonSession.mutate(); }}
            className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Exercise tabs */}
      <div className="flex gap-1.5 px-4 py-3 overflow-x-auto hide-scrollbar">
        {exercises.map((ex, i) => (
          <button
            key={ex.id}
            onClick={() => setCurrentExIdx(i)}
            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              i === currentExIdx ? 'bg-indigo-600 text-white'
              : ex.status === 'completed' ? 'bg-green-900/40 text-green-400'
              : 'bg-gray-800 text-gray-400'
            }`}
          >
            {ex.exercise_name.split(' ')[0]}
          </button>
        ))}
        <button onClick={() => setAddExOpen(true)} className="shrink-0 px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-500 hover:text-white">
          <Plus size={12} />
        </button>
      </div>

      {/* Rest timer overlay */}
      {restRunning && (
        <div className="mx-4 mb-2 bg-indigo-950 border border-indigo-800 rounded-2xl p-4 text-center">
          <p className="text-xs text-indigo-400 mb-1">Rest</p>
          <p className="text-4xl font-bold text-white tabular-nums">{restSecondsLeft}s</p>
          <div className="h-1 bg-indigo-900 rounded-full mt-3 overflow-hidden">
            <div className="h-full bg-indigo-400 transition-all" style={{ width: `${(restSecondsLeft / (currentEx?.rest_seconds ?? 90)) * 100}%` }} />
          </div>
          <button onClick={stopRest} className="mt-2 text-xs text-indigo-400 hover:text-white">Skip rest</button>
        </div>
      )}

      {/* Current exercise */}
      {currentEx && !allDone && (
        <div className="flex-1 px-4 pb-4 space-y-4">
          <ExerciseCard
            ex={currentEx}
            completedSets={completedSets}
            prevSet={prevSet}
            onLogSet={(data) => {
              logSet.mutate({ seId: currentEx.id, ...data });
              if (completedSets + 1 >= totalSets) {
                api.put(`/workouts/session-exercises/${currentEx.id}/complete`, {});
                // Auto-advance after brief delay
                setTimeout(() => {
                  if (currentExIdx < exercises.length - 1) {
                    setCurrentExIdx(i => i + 1);
                    startRest(currentEx.rest_seconds);
                  }
                }, 500);
              } else {
                startRest(currentEx.rest_seconds);
              }
            }}
            loading={logSet.isPending}
          />

          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                api.put(`/workouts/session-exercises/${currentEx.id}/complete`, {});
                if (currentExIdx < exercises.length - 1) {
                  setCurrentExIdx(i => i + 1);
                  startRest(currentEx.rest_seconds);
                }
                refetch();
              }}
              className="flex-1"
            >
              <SkipForward size={13} /> Skip Exercise
            </Button>
          </div>
        </div>
      )}

      {/* All done */}
      {allDone && (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-4">
          <CheckCircle size={48} className="text-green-400" />
          <p className="text-xl font-bold text-white">Workout Complete!</p>
          <p className="text-sm text-gray-400 text-center">
            {exercises.length} exercises · {formatDuration(elapsed)} total
          </p>
          <Button onClick={() => completeSession.mutate()} disabled={completeSession.isPending} className="w-full" size="lg">
            {completeSession.isPending ? 'Saving…' : 'Finish & Save'}
          </Button>
        </div>
      )}

      {/* Add ad-hoc exercise */}
      {addExOpen && (
        <AddAdHocExerciseModal
          sessionId={Number(paramId)}
          onClose={() => setAddExOpen(false)}
          onAdded={() => { refetch(); setAddExOpen(false); }}
        />
      )}
    </div>
  );
}

function ExerciseCard({ ex, completedSets, prevSet, onLogSet, loading }: {
  ex: SessionExercise;
  completedSets: number;
  prevSet?: { actual_reps?: number; actual_weight_value?: number; actual_weight_unit: string; actual_duration_seconds?: number; is_pb: number };
  onLogSet: (data: { reps?: number; duration?: number; weight?: number; weightUnit: string }) => void;
  loading: boolean;
}) {
  const [reps, setReps] = useState(String(ex.target_reps ?? ''));
  const [duration, setDuration] = useState(String(ex.target_duration_seconds ?? ''));
  const [weight, setWeight] = useState(String(ex.target_weight_value ?? ''));
  const [weightUnit, setWeightUnit] = useState(ex.target_weight_unit);

  const isTimed = ex.exercise_type === 'timed';

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
      {/* Exercise info */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          {isTimed ? <Timer size={16} className="text-purple-400" /> : <Dumbbell size={16} className="text-blue-400" />}
          <h2 className="text-lg font-bold text-white">{ex.exercise_name}</h2>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-indigo-400 font-semibold">Set {completedSets + 1} of {ex.target_sets}</span>
          {isTimed
            ? <span className="text-gray-400">Target: {ex.target_duration_seconds}s</span>
            : <span className="text-gray-400">Target: {ex.target_reps} reps @ {ex.target_weight_value}{ex.target_weight_unit}</span>}
        </div>
      </div>

      {/* Previous set / PB */}
      {prevSet && (
        <div className="flex gap-4 text-xs">
          <div className="bg-gray-800 rounded-lg px-3 py-2">
            <p className="text-gray-500 mb-0.5">Previous set</p>
            <p className="text-white font-medium">
              {isTimed
                ? `${prevSet.actual_duration_seconds}s`
                : `${prevSet.actual_reps} × ${prevSet.actual_weight_value}${prevSet.actual_weight_unit}`}
              {prevSet.is_pb ? <span className="ml-1.5 text-yellow-400">🏆 PB</span> : ''}
            </p>
          </div>
        </div>
      )}

      {/* Input */}
      <div className="space-y-3">
        {isTimed ? (
          <Input label="Duration (seconds)" type="number" value={duration} onChange={e => setDuration(e.target.value)} suffix="s" />
        ) : (
          <div className="grid grid-cols-3 gap-2">
            <Input label="Reps" type="number" value={reps} onChange={e => setReps(e.target.value)} />
            <Input label="Weight" type="number" value={weight} onChange={e => setWeight(e.target.value)} />
            <Select label="Unit" value={weightUnit} onChange={e => setWeightUnit(e.target.value)}
              options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
          </div>
        )}

        <Button
          onClick={() => onLogSet({
            reps: isTimed ? undefined : (parseInt(reps) || undefined),
            duration: isTimed ? (parseFloat(duration) || undefined) : undefined,
            weight: weight ? parseFloat(weight) : undefined,
            weightUnit,
          })}
          disabled={loading || (isTimed ? !duration : !reps)}
          className="w-full"
          size="lg"
        >
          <CheckCircle size={16} />
          {completedSets + 1 < ex.target_sets ? `Done — Next Set (${completedSets + 2}/${ex.target_sets})` : 'Done — Next Exercise'}
        </Button>
      </div>
    </div>
  );
}

function AddAdHocExerciseModal({ sessionId, onClose, onAdded }: {
  sessionId: number; onClose: () => void; onAdded: () => void;
}) {
  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises', ''],
    queryFn: () => api.get<Exercise[]>('/exercises'),
  });

  const [form, setForm] = useState({ exercise_id: exercises[0]?.id ?? 0, target_sets: 3, target_reps: 8, target_weight_value: '', target_weight_unit: 'lb', rest_seconds: 90 });
  const selectedEx = exercises.find(e => e.id === Number(form.exercise_id));

  const add = useMutation({
    mutationFn: () => api.post(`/workouts/${sessionId}/exercises`, {
      exercise_id: Number(form.exercise_id),
      target_sets: form.target_sets,
      target_reps: selectedEx?.exercise_type === 'reps' ? form.target_reps : undefined,
      target_weight_value: form.target_weight_value ? parseFloat(form.target_weight_value) : undefined,
      target_weight_unit: form.target_weight_unit,
      rest_seconds: form.rest_seconds,
    }),
    onSuccess: onAdded,
  });

  return (
    <Modal open onClose={onClose} title="Add Exercise" size="md">
      <div className="space-y-3">
        <Select label="Exercise" value={form.exercise_id}
          onChange={e => setForm(f => ({ ...f, exercise_id: Number(e.target.value) }))}
          options={exercises.map(e => ({ value: e.id, label: e.name }))} />
        <div className="grid grid-cols-2 gap-2">
          <Input label="Sets" type="number" value={form.target_sets} onChange={e => setForm(f => ({ ...f, target_sets: parseInt(e.target.value) || 3 }))} />
          <Input label="Reps" type="number" value={form.target_reps} onChange={e => setForm(f => ({ ...f, target_reps: parseInt(e.target.value) || 8 }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Weight" type="number" value={form.target_weight_value} onChange={e => setForm(f => ({ ...f, target_weight_value: e.target.value }))} />
          <Select label="Unit" value={form.target_weight_unit} onChange={e => setForm(f => ({ ...f, target_weight_unit: e.target.value }))}
            options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
        </div>
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => add.mutate()} disabled={add.isPending} className="flex-1">Add</Button>
        </div>
      </div>
    </Modal>
  );
}
