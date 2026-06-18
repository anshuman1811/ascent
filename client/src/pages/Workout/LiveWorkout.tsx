import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, SkipForward, X, Trophy, Timer, Dumbbell, Clock, Plus, Pencil, Check, Flame, BookOpen } from 'lucide-react';
import { api } from '../../api/client';
import { useAppStore, useWorkoutStore } from '../../store/appStore';
import type { WorkoutSession, SessionExercise, SetLog, Exercise } from '../../types';
import { formatDuration, parseSQLiteLocal } from '../../utils/units';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import ExerciseAnimation from '../../components/ui/ExerciseAnimation';
import MuscleMap, { MuscleMapLegend } from '../../components/ui/MuscleMap';

interface OutletCtx { userId: number; }

export default function LiveWorkout({ userId: propUserId }: { userId?: number }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;
  const { sessionId: paramId } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { restSecondsLeft, restRunning, startRest, tickRest, stopRest, clearSession } = useWorkoutStore();

  const [currentExIdx, setCurrentExIdx] = useState(0);
  const [addExOpen, setAddExOpen] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [completedData, setCompletedData] = useState<WorkoutSession | null>(null);
  const [caloriesOverride, setCaloriesOverride] = useState<string>('');

  const { data: session, refetch } = useQuery({
    queryKey: ['session', paramId],
    queryFn: () => api.get<WorkoutSession>(`/workouts/${paramId}`),
    enabled: !!paramId,
    refetchInterval: false,
  });

  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - parseSQLiteLocal(session.started_at).getTime()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [session?.started_at]);

  useEffect(() => {
    if (!restRunning) return;
    const t = setInterval(tickRest, 1000);
    return () => clearInterval(t);
  }, [restRunning, tickRest]);

  const logSet = useMutation({
    mutationFn: (data: { seId: number; reps?: number; duration?: number; weight?: number; weightUnit: string; restSeconds?: number }) =>
      api.post(`/workouts/session-exercises/${data.seId}/sets`, {
        actual_reps: data.reps,
        actual_duration_seconds: data.duration,
        actual_weight_value: data.weight,
        actual_weight_unit: data.weightUnit,
        actual_rest_seconds: data.restSeconds,
      }),
    onSuccess: () => refetch(),
  });

  const updateSet = useMutation({
    mutationFn: (data: { setId: number; reps?: number; duration?: number; weight?: number; weightUnit: string }) =>
      api.put(`/workouts/sets/${data.setId}`, {
        actual_reps: data.reps,
        actual_duration_seconds: data.duration,
        actual_weight_value: data.weight,
        actual_weight_unit: data.weightUnit,
      }),
    onSuccess: () => refetch(),
  });

  const completeSession = useMutation({
    mutationFn: () => api.put<WorkoutSession>(`/workouts/${paramId}/finish`, { total_rest_seconds: elapsed }),
    onSuccess: (finished) => {
      clearSession();
      qc.invalidateQueries({ queryKey: ['active-session', userId] });
      setCompletedData(finished);
      setCaloriesOverride(String(finished.calories_burned ?? ''));
    },
  });

  const saveCaloriesOverride = useMutation({
    mutationFn: (kcal: number | null) => api.patch(`/workouts/${paramId}`, { calories_burned: kcal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-history', userId] });
      qc.invalidateQueries({ queryKey: ['daily-summary', userId] });
      navigate('/workout');
    },
  });

  const abandonSession = useMutation({
    mutationFn: () => api.put(`/workouts/${paramId}/abandon`, {}),
    onSuccess: () => { clearSession(); navigate('/workout'); },
  });

  // ── Exercise history — must be before any early returns (Rules of Hooks) ──
  // currentExIdx is state; session?.exercises is optional — safe with enabled guard
  const activeExerciseId = session?.exercises[currentExIdx]?.exercise_id;
  const { data: exHistory } = useQuery({
    queryKey: ['ex-history', userId, activeExerciseId, paramId],
    queryFn: () => api.get<{
      last_session: { id: number; completed_at: string; session_name: string } | null;
      last_sets: Array<{ set_number: number; actual_reps: number | null; actual_duration_seconds: number | null; actual_weight_value: number | null; actual_weight_unit: string; is_pb: number }>;
      pbs: Array<{ rep_count: number | null; weight_value: number | null; weight_unit: string; duration_seconds: number | null; achieved_at: string }>;
    }>(`/exercises/${activeExerciseId}/history?user_id=${userId}&current_session_id=${paramId}`),
    enabled: !!activeExerciseId && !!userId,
    staleTime: 30_000,
  });

  if (!session) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading…</div>;

  // Completion summary screen
  if (completedData) {
    const dur = completedData.completed_at
      ? Math.round((parseSQLiteLocal(completedData.completed_at).getTime() - parseSQLiteLocal(completedData.started_at).getTime()) / 1000)
      : elapsed;
    const exercisesCompleted = completedData.exercises?.filter(e => e.status === 'completed').length ?? 0;
    const estimatedCals = completedData.calories_burned;
    const overrideVal = caloriesOverride === '' ? null : Number(caloriesOverride);
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6 space-y-6">
        <CheckCircle size={56} className="text-green-400" />
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white">Workout Complete!</h1>
          <p className="text-gray-400 mt-1">{completedData.name}</p>
        </div>
        <div className="w-full bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Duration</span>
            <span className="text-white font-medium">{formatDuration(dur)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Exercises</span>
            <span className="text-white font-medium">{exercisesCompleted}</span>
          </div>
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-400 flex items-center gap-1"><Flame size={13} className="text-orange-400" /> Calories burned</span>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={caloriesOverride}
                onChange={e => setCaloriesOverride(e.target.value)}
                placeholder={estimatedCals ? String(Math.round(estimatedCals)) : '—'}
                className="w-20 text-right bg-gray-800 border border-gray-700 rounded-lg px-2 py-1 text-sm text-white focus:border-indigo-500 outline-none"
              />
              <span className="text-gray-500">kcal</span>
            </div>
          </div>
          {estimatedCals && (
            <p className="text-[11px] text-gray-600">
              Auto-estimated: {Math.round(estimatedCals)} kcal — override with your fitness tracker value if available
            </p>
          )}
        </div>
        <Button
          className="w-full"
          size="lg"
          onClick={() => saveCaloriesOverride.mutate(overrideVal)}
          disabled={saveCaloriesOverride.isPending}
        >
          {saveCaloriesOverride.isPending ? 'Saving…' : 'Done'}
        </Button>
      </div>
    );
  }

  const exercises = session.exercises;
  const currentEx = exercises[currentExIdx];
  const completedSets = currentEx?.sets.length ?? 0;
  const totalSets = currentEx?.target_sets ?? 0;
  const allDone = exercises.length > 0 && exercises.every(ex => ex.status === 'completed' || ex.status === 'skipped');

  const prevSet = currentEx?.sets[currentEx.sets.length - 1];

  function handleLogSet(data: { reps?: number; duration?: number; weight?: number; weightUnit: string; restSeconds?: number }) {
    logSet.mutate({ seId: currentEx.id, ...data });
    const willComplete = completedSets + 1 >= totalSets;
    if (willComplete) {
      api.put(`/workouts/session-exercises/${currentEx.id}/complete`, {});
      setTimeout(() => {
        if (currentExIdx < exercises.length - 1) {
          setCurrentExIdx(i => i + 1);
          // Global rest timer only fires when moving between exercises
          startRest(currentEx.rest_seconds);
        }
      }, 500);
    }
    // Within-exercise rest is handled locally by ExerciseCard's phase state machine
  }

  function handleFinish() {
    if (allDone || exercises.length === 0) {
      completeSession.mutate();
    } else {
      setFinishConfirm(true);
    }
  }

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
          <Button size="sm" onClick={handleFinish} disabled={completeSession.isPending} className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5">
            {completeSession.isPending ? 'Saving…' : 'Finish'}
          </Button>
          <button
            onClick={() => setAbandonConfirm(true)}
            className="p-1.5 text-gray-600 hover:text-red-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Exercise tabs */}
      <div className="flex gap-1.5 px-4 py-3 overflow-x-auto hide-scrollbar">
        {exercises.map((ex, i) => {
          const done = ex.status === 'completed' || ex.status === 'skipped';
          return (
            <button
              key={ex.id}
              onClick={() => setCurrentExIdx(i)}
              className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                i === currentExIdx ? 'bg-indigo-600 text-white'
                : done ? 'bg-green-900/40 text-green-400'
                : 'bg-gray-800 text-gray-400'
              }`}
            >
              {ex.exercise_name.split(' ')[0]}
              {done && ' ✓'}
            </button>
          );
        })}
        <button onClick={() => setAddExOpen(true)} className="shrink-0 px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-500 hover:text-white">
          <Plus size={12} />
        </button>
      </div>

      {/* Rest timer — kept for cross-exercise rest when moving to next exercise */}
      {restRunning && (
        <div className="mx-4 mb-2 bg-indigo-950/30 border border-indigo-800/30 rounded-xl px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Timer size={13} className="text-indigo-400" />
            <span className="text-xs text-indigo-400">Between exercises</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm font-bold text-white tabular-nums">{restSecondsLeft}s</span>
            <button onClick={stopRest} className="text-xs text-indigo-400 hover:text-white">Skip</button>
          </div>
        </div>
      )}

      {/* Current exercise — single column portrait, two columns landscape */}
      {currentEx && (
        <div className="flex-1 px-4 pb-4 landscape:grid landscape:grid-cols-2 landscape:gap-4 landscape:items-start space-y-4 landscape:space-y-0">
          <ExerciseCard
            ex={currentEx}
            completedSets={completedSets}
            prevSet={prevSet}
            history={exHistory ?? null}
            onLogSet={handleLogSet}
            onUpdateSet={(setId, data) => updateSet.mutate({ setId, ...data })}
            loading={logSet.isPending}
            updateLoading={updateSet.isPending}
          />

          <div className="flex gap-2 landscape:flex-col landscape:pt-0">
            {currentExIdx > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setCurrentExIdx(i => i - 1)} className="flex-1 landscape:flex-none">
                ← Prev
              </Button>
            )}
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
              className="flex-1 landscape:flex-none"
            >
              <SkipForward size={13} /> Skip Exercise
            </Button>
            {currentExIdx < exercises.length - 1 && (
              <Button variant="secondary" size="sm" onClick={() => setCurrentExIdx(i => i + 1)} className="flex-1 landscape:flex-none">
                Next →
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Empty workout state */}
      {exercises.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center px-4 py-12 text-center">
          <Dumbbell size={36} className="text-gray-700 mb-3" />
          <p className="text-sm font-medium text-gray-400">No exercises yet</p>
          <p className="text-xs text-gray-600 mt-1 mb-4">Tap + to add your first exercise</p>
          <Button size="sm" variant="secondary" onClick={() => setAddExOpen(true)}>
            <Plus size={14} /> Add Exercise
          </Button>
        </div>
      )}

      {/* All done celebration */}
      {allDone && (
        <div className="mx-4 mb-4 bg-green-950 border border-green-800 rounded-2xl p-5 text-center">
          <CheckCircle size={36} className="text-green-400 mx-auto mb-2" />
          <p className="text-lg font-bold text-white">All done!</p>
          <p className="text-sm text-gray-400 mt-1 mb-3">{exercises.length} exercises · {formatDuration(elapsed)}</p>
          <Button onClick={() => completeSession.mutate()} disabled={completeSession.isPending} className="w-full" size="lg">
            {completeSession.isPending ? 'Saving…' : 'Save Workout'}
          </Button>
        </div>
      )}

      {/* Abandon confirmation */}
      {abandonConfirm && (
        <Modal open onClose={() => setAbandonConfirm(false)} title="Abandon Workout?" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              Your progress will not be saved. This can't be undone.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setAbandonConfirm(false)} className="flex-1">Keep Going</Button>
              <Button
                onClick={() => { setAbandonConfirm(false); abandonSession.mutate(); }}
                disabled={abandonSession.isPending}
                className="flex-1 bg-red-700 hover:bg-red-600"
              >
                {abandonSession.isPending ? 'Abandoning…' : 'Abandon'}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Finish early confirmation */}
      {finishConfirm && (
        <Modal open onClose={() => setFinishConfirm(false)} title="Finish Workout?" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              {exercises.filter(e => e.status !== 'completed' && e.status !== 'skipped').length} exercise(s) still pending. You can finish now or go back.
            </p>
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setFinishConfirm(false)} className="flex-1">Keep Going</Button>
              <Button
                onClick={() => { setFinishConfirm(false); completeSession.mutate(); }}
                disabled={completeSession.isPending}
                className="flex-1"
              >
                {completeSession.isPending ? 'Saving…' : 'Finish & Save'}
              </Button>
            </div>
          </div>
        </Modal>
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

// ─── ExerciseCard ─────────────────────────────────────────────────────────────

type ExHistory = {
  last_session: { id: number; completed_at: string; session_name: string } | null;
  last_sets: Array<{ set_number: number; actual_reps: number | null; actual_duration_seconds: number | null; actual_weight_value: number | null; actual_weight_unit: string; is_pb: number }>;
  pbs: Array<{ rep_count: number | null; weight_value: number | null; weight_unit: string; duration_seconds: number | null; achieved_at: string }>;
} | null;

function ExerciseCard({ ex, completedSets, prevSet, history, onLogSet, onUpdateSet, loading, updateLoading }: {
  ex: SessionExercise;
  completedSets: number;
  prevSet?: SetLog;
  history: ExHistory;
  onLogSet: (data: { reps?: number; duration?: number; weight?: number; weightUnit: string; restSeconds?: number }) => void;
  onUpdateSet: (setId: number, data: { reps?: number; duration?: number; weight?: number; weightUnit: string }) => void;
  loading: boolean;
  updateLoading: boolean;
}) {
  const [reps, setReps] = useState(String(ex.target_reps ?? ''));
  const [duration, setDuration] = useState(String(ex.target_duration_seconds ?? ''));
  const [weight, setWeight] = useState(String(ex.target_weight_value ?? ''));
  const [weightUnit, setWeightUnit] = useState(ex.target_weight_unit ?? 'lb');
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editReps, setEditReps] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editWeightUnit, setEditWeightUnit] = useState('lb');
  const [techniqueOpen, setTechniqueOpen] = useState(false);
  // Rest-phase tracking: 'active' = logging form shown, 'resting' = rest between sets
  const [phase, setPhase] = useState<'active' | 'resting'>('active');
  const [restStartTs, setRestStartTs] = useState<number | null>(null);
  const [restElapsed, setRestElapsed] = useState(0);
  const [pendingRestSeconds, setPendingRestSeconds] = useState<number | undefined>(undefined);

  // Reset form + phase when exercise changes
  useEffect(() => {
    setReps(String(ex.target_reps ?? ''));
    setDuration(String(ex.target_duration_seconds ?? ''));
    setWeight(String(ex.target_weight_value ?? ''));
    setWeightUnit(ex.target_weight_unit ?? 'lb');
    setEditingSetId(null);
    setTechniqueOpen(false);
    setPhase('active');
    setRestStartTs(null);
    setRestElapsed(0);
    setPendingRestSeconds(undefined);
  }, [ex.id]);

  // Tick rest elapsed counter
  useEffect(() => {
    if (phase !== 'resting' || restStartTs === null) return;
    const t = setInterval(() => {
      setRestElapsed(Math.floor((Date.now() - restStartTs) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [phase, restStartTs]);

  const isTimed = ex.exercise_type === 'timed';
  const isDone = ex.status === 'completed' || ex.status === 'skipped';

  function startEdit(set: SetLog) {
    setEditingSetId(set.id);
    setEditReps(String(set.actual_reps ?? ''));
    setEditDuration(String(set.actual_duration_seconds ?? ''));
    setEditWeight(String(set.actual_weight_value ?? ''));
    setEditWeightUnit(set.actual_weight_unit ?? 'lb');
  }

  function saveEdit(set: SetLog) {
    onUpdateSet(set.id, {
      reps: isTimed ? undefined : (parseInt(editReps) || undefined),
      duration: isTimed ? (parseFloat(editDuration) || undefined) : undefined,
      weight: editWeight ? parseFloat(editWeight) : undefined,
      weightUnit: editWeightUnit,
    });
    setEditingSetId(null);
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
      {/* Exercise info */}
      <div>
        <div className="flex items-center justify-between gap-2 mb-1">
          <div className="flex items-center gap-2 min-w-0">
            {isTimed ? <Timer size={16} className="text-purple-400 shrink-0" /> : <Dumbbell size={16} className="text-blue-400 shrink-0" />}
            <h2 className="text-lg font-bold text-white truncate">{ex.exercise_name}</h2>
          </div>
          {(ex.gif_url || ex.primary_muscles?.length > 0) && (
            <button
              onClick={() => setTechniqueOpen(o => !o)}
              className={`flex items-center gap-1 shrink-0 px-2 py-1 rounded-lg text-xs transition-colors ${
                techniqueOpen ? 'bg-indigo-800/50 text-indigo-300' : 'bg-gray-800 text-gray-500 hover:text-white'
              }`}
            >
              <BookOpen size={11} />
              <span>Technique</span>
            </button>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="text-indigo-400 font-semibold">{completedSets}/{ex.target_sets} sets done</span>
          {isTimed
            ? <span className="text-gray-400">Target: {ex.target_duration_seconds}s</span>
            : <span className="text-gray-400">Target: {ex.target_reps} reps @ {ex.target_weight_value || '—'}{ex.target_weight_unit}</span>}
        </div>

        {/* Previous session + PB context */}
        {(() => {
          const rawSets = history?.last_sets ?? [];
          const pbs = history?.pbs ?? [];
          // Filter out sets with no meaningful weight (0 or null) for strength exercises
          const lastSets = isTimed
            ? rawSets.filter(s => s.actual_duration_seconds)
            : rawSets.filter(s => s.actual_weight_value && s.actual_weight_value > 0);
          // Best PB matching target reps; fall back to the heaviest PB overall
          const targetRepPB = pbs.find(p => p.rep_count === ex.target_reps)
            ?? (pbs.length > 0 ? pbs.reduce((best, p) =>
              (p.weight_value ?? 0) > (best.weight_value ?? 0) ? p : best
            ) : null);
          const hasHistory = lastSets.length > 0 || targetRepPB;
          if (!hasHistory) return null;

          return (
            <div className="mt-2.5 pt-2.5 border-t border-gray-800 flex flex-wrap gap-x-5 gap-y-1.5">
              {lastSets.length > 0 && (
                <div className="flex items-start gap-1.5 min-w-0">
                  <Clock size={11} className="text-gray-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide leading-none mb-0.5">Last session</p>
                    <p className="text-xs text-gray-300 leading-snug">
                      {lastSets.map((s, i) => (
                        <span key={i}>
                          {i > 0 && <span className="text-gray-700 mx-0.5">·</span>}
                          {isTimed ? `${s.actual_duration_seconds}s` : `${s.actual_reps}×${s.actual_weight_value}${s.actual_weight_unit}`}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              )}
              {targetRepPB && (targetRepPB.weight_value != null || targetRepPB.duration_seconds != null) && (
                <div className="flex items-start gap-1.5">
                  <Trophy size={11} className="text-amber-500 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide leading-none mb-0.5">
                      PB{targetRepPB.rep_count ? ` · ${targetRepPB.rep_count} reps` : ''}
                    </p>
                    <p className="text-xs text-amber-400 font-semibold leading-snug">
                      {targetRepPB.weight_value != null
                        ? `${targetRepPB.weight_value}${targetRepPB.weight_unit}`
                        : `${targetRepPB.duration_seconds}s`}
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Technique panel */}
      {techniqueOpen && (ex.gif_url || ex.primary_muscles?.length > 0) && (
        <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-3">
          <div className="flex flex-col sm:flex-row gap-3 items-start">
            {ex.gif_url && (
              <div className="w-full sm:flex-1 rounded-lg overflow-hidden bg-gray-900">
                <ExerciseAnimation
                  gifUrl={ex.gif_url}
                  name={ex.exercise_name}
                  className="w-full"
                />
              </div>
            )}
            {ex.primary_muscles?.length > 0 && (
              <div className="flex flex-col items-center gap-1 sm:w-36 w-full">
                <MuscleMap
                  primary={ex.primary_muscles}
                  secondary={ex.secondary_muscles ?? []}
                  className="w-32"
                />
                <MuscleMapLegend mode="exercise" />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Logged sets list */}
      {ex.sets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Logged Sets</p>
          {ex.sets.map((set, idx) => (
            <div key={set.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2">
              {editingSetId === set.id ? (
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-gray-500 w-6">#{set.set_number}</span>
                  {isTimed ? (
                    <Input
                      type="number" value={editDuration}
                      onChange={e => setEditDuration(e.target.value)}
                      suffix="s" className="flex-1"
                    />
                  ) : (
                    <>
                      <Input type="number" value={editReps} onChange={e => setEditReps(e.target.value)} placeholder="Reps" className="w-16" />
                      <Input type="number" value={editWeight} onChange={e => setEditWeight(e.target.value)} placeholder="Wt" className="w-16" />
                      <Select value={editWeightUnit} onChange={e => setEditWeightUnit(e.target.value)}
                        options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} className="w-16" />
                    </>
                  )}
                  <button onClick={() => saveEdit(set)} disabled={updateLoading} className="p-1 text-green-400 hover:text-green-300">
                    <Check size={14} />
                  </button>
                  <button onClick={() => setEditingSetId(null)} className="p-1 text-gray-500 hover:text-white">
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">#{set.set_number}</span>
                    <span className="text-sm text-white font-medium">
                      {isTimed
                        ? `${set.actual_duration_seconds}s`
                        : `${set.actual_reps} × ${set.actual_weight_value ?? 0}${set.actual_weight_unit}`}
                    </span>
                    {set.is_pb === 1 && <Trophy size={12} className="text-yellow-400" />}
                  </div>
                  <button onClick={() => startEdit(set)} className="p-1 text-gray-600 hover:text-indigo-400 transition-colors">
                    <Pencil size={12} />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Rest phase — shown after logging a set, before starting the next */}
      {!isDone && phase === 'resting' && (
        <div className="space-y-3">
          <div className="bg-indigo-950/60 border border-indigo-800/50 rounded-2xl p-4 text-center space-y-2">
            <p className="text-xs font-medium text-indigo-400 uppercase tracking-wide">Rest</p>
            <p className="text-4xl font-bold text-white tabular-nums">{restElapsed}s</p>
            <div className="h-1.5 bg-indigo-900/50 rounded-full overflow-hidden">
              <div
                className="h-full bg-indigo-500 transition-all duration-1000"
                style={{ width: `${Math.min(100, (restElapsed / (ex.rest_seconds ?? 90)) * 100)}%` }}
              />
            </div>
            <p className="text-[11px] text-indigo-400/60">Target: {ex.rest_seconds}s</p>
          </div>
          <Button
            onClick={() => {
              setPendingRestSeconds(restElapsed);
              setPhase('active');
            }}
            className={`w-full transition-colors ${
              restElapsed >= (ex.rest_seconds ?? 90)
                ? 'bg-green-700 hover:bg-green-600'
                : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
            size="lg"
          >
            <Timer size={16} />
            Start Set {completedSets + 1}
            {restElapsed >= (ex.rest_seconds ?? 90) && <span className="ml-1 text-xs opacity-75">✓ rested</span>}
          </Button>
        </div>
      )}

      {/* New set input — shown when phase is 'active' and exercise is not done */}
      {!isDone && phase === 'active' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
              Set {completedSets + 1}
            </p>
            {pendingRestSeconds !== undefined && (
              <p className="text-[11px] text-indigo-400/70">
                Rest: {pendingRestSeconds}s
              </p>
            )}
          </div>

          {/* Pre-fill from last set */}
          {prevSet && completedSets === 0 && (
            <p className="text-xs text-gray-600">
              Last: {isTimed
                ? `${prevSet.actual_duration_seconds}s`
                : `${prevSet.actual_reps} × ${prevSet.actual_weight_value ?? 0}${prevSet.actual_weight_unit}`}
            </p>
          )}

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
            onClick={() => {
              const restSecs = pendingRestSeconds;
              setPendingRestSeconds(undefined);
              onLogSet({
                reps: isTimed ? undefined : (parseInt(reps) || undefined),
                duration: isTimed ? (parseFloat(duration) || undefined) : undefined,
                weight: weight ? parseFloat(weight) : undefined,
                weightUnit,
                restSeconds: restSecs,
              });
              // Enter rest phase for next set (not after the final set)
              const isLastSet = completedSets + 1 >= ex.target_sets;
              if (!isLastSet) {
                setPhase('resting');
                setRestStartTs(Date.now());
                setRestElapsed(0);
              }
            }}
            disabled={loading || (isTimed ? !duration : !reps)}
            className="w-full"
            size="lg"
          >
            <CheckCircle size={16} />
            {completedSets + 1 < ex.target_sets ? `Log Set ${completedSets + 1} — ${completedSets + 2}/${ex.target_sets} up next` : 'Log Final Set'}
          </Button>
        </div>
      )}

      {isDone && (
        <p className="text-xs text-green-400 text-center py-1">
          {ex.status === 'completed' ? '✓ Exercise complete' : '↷ Skipped'} — tap pencil to edit any set
        </p>
      )}
    </div>
  );
}

// ─── AddAdHocExerciseModal ────────────────────────────────────────────────────

function AddAdHocExerciseModal({ sessionId, onClose, onAdded }: {
  sessionId: number; onClose: () => void; onAdded: () => void;
}) {
  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises', ''],
    queryFn: () => api.get<Exercise[]>('/exercises'),
  });

  const [form, setForm] = useState({
    exercise_id: exercises[0]?.id ?? 0,
    target_sets: 3, target_reps: 8,
    target_weight_value: '', target_weight_unit: 'lb', rest_seconds: 90,
  });
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
          <Input label="Sets" type="number" value={form.target_sets}
            onChange={e => setForm(f => ({ ...f, target_sets: parseInt(e.target.value) || 3 }))} />
          <Input label="Reps" type="number" value={form.target_reps}
            onChange={e => setForm(f => ({ ...f, target_reps: parseInt(e.target.value) || 8 }))} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Input label="Weight" type="number" value={form.target_weight_value}
            onChange={e => setForm(f => ({ ...f, target_weight_value: e.target.value }))} />
          <Select label="Unit" value={form.target_weight_unit}
            onChange={e => setForm(f => ({ ...f, target_weight_unit: e.target.value }))}
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
