import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useNavigate, useParams } from 'react-router-dom';
import { CheckCircle, SkipForward, X, Trophy, Timer, Dumbbell, Clock, Plus, Pencil, Check, Flame, BookOpen, ArrowLeftRight, ChevronUp, ChevronDown, GripVertical } from 'lucide-react';
import { api } from '../../api/client';
import { useAppStore, useWorkoutStore } from '../../store/appStore';
import type { WorkoutSession, SessionExercise, SetLog, Exercise, ExerciseCategory } from '../../types';
import { formatDuration, parseSQLiteLocal } from '../../utils/units';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import ExerciseAnimation from '../../components/ui/ExerciseAnimation';
import MuscleMap, { MuscleMapLegend } from '../../components/ui/MuscleMap';

interface OutletCtx { userId: number; }

// ─── RestCard ───────────────────────────────────────────────────────────────
// Single consistent rest-timer treatment used both between sets and between
// exercises: counts down to target in blue, then counts up in red once over.
// Target time always stays visible (even past it) so it's never lost.
function RestCard({ target, remaining, overtimeSeconds, isOver, label, buttonLabel, onStart }: {
  target: number;
  remaining: number;
  overtimeSeconds: number;
  isOver: boolean;
  label: string;
  buttonLabel: string;
  onStart: () => void;
}) {
  const elapsed = isOver ? target + overtimeSeconds : target - remaining;
  return (
    <div className="space-y-3">
      <div className={`border rounded-2xl p-4 text-center space-y-2 ${
        isOver ? 'bg-red-950/40 border-red-800/50' : 'bg-blue-950/60 border-blue-800/50'
      }`}>
        <p className={`text-xs font-medium uppercase tracking-wide ${isOver ? 'text-red-400' : 'text-blue-400'}`}>
          {isOver ? `${label} — overtime` : label}
        </p>
        <p className={`text-4xl font-bold tabular-nums ${isOver ? 'text-red-400' : 'text-white'}`}>
          {isOver ? `+${overtimeSeconds}` : remaining}s
        </p>
        <div className={`h-1.5 rounded-full overflow-hidden ${isOver ? 'bg-red-900/50' : 'bg-blue-900/50'}`}>
          <div
            className={`h-full transition-all duration-1000 ${isOver ? 'bg-red-500' : 'bg-blue-500'}`}
            style={{ width: isOver ? '100%' : `${Math.min(100, (elapsed / target) * 100)}%` }}
          />
        </div>
        <p className={`text-[11px] ${isOver ? 'text-red-400/60' : 'text-blue-400/60'}`}>Target: {target}s</p>
      </div>
      <Button onClick={onStart} className={`w-full transition-colors ${isOver ? 'bg-red-700 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-500'}`} size="lg">
        <Timer size={16} />
        {buttonLabel}
        {isOver && <span className="ml-1 text-xs opacity-75">✓ rested</span>}
      </Button>
    </div>
  );
}

export default function LiveWorkout({ userId: propUserId, sessionIdOverride, onExit }: { userId?: number; sessionIdOverride?: number; onExit?: () => void }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;
  const { sessionId: paramId } = useParams();
  const sessionId = sessionIdOverride ?? Number(paramId);
  const navigate = useNavigate();
  const exit = onExit ?? (() => navigate('/workout'));
  // In split-screen pair mode this is squeezed into a fixed-size rotated pane —
  // it must fill that pane's height rather than the natural device viewport.
  const rootHeightClass = sessionIdOverride ? 'min-h-full' : 'min-h-screen';
  const qc = useQueryClient();
  const { startRest, tickRest, stopRest, clearSession } = useWorkoutStore();
  const { restSecondsLeft, restTargetSeconds, restOvertime, restRunning } = useWorkoutStore(s => s.getSession(sessionId));

  const [currentExIdx, setCurrentExIdx] = useState(0);
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track current exercise by SE id so reorder/refetch doesn't land on the wrong exercise.
  const currentSeIdRef = useRef<number | null>(null);
  const [addExOpen, setAddExOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [reorderOpen, setReorderOpen] = useState(false);
  const [skipConfirmExId, setSkipConfirmExId] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [finishConfirm, setFinishConfirm] = useState(false);
  const [abandonConfirm, setAbandonConfirm] = useState(false);
  const [completedData, setCompletedData] = useState<WorkoutSession | null>(null);
  const [caloriesOverride, setCaloriesOverride] = useState<string>('');

  const { data: session, refetch } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => api.get<WorkoutSession>(`/workouts/${sessionId}`),
    enabled: !!sessionId,
    refetchInterval: 15_000,   // poll for multi-device sync
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    if (!session) return;
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - parseSQLiteLocal(session.started_at).getTime()) / 1000)));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [session?.started_at]);

  // On initial load, jump to the first in-progress/pending exercise (multi-device resume)
  useEffect(() => {
    if (!session) return;
    const firstActive = session.exercises.findIndex(
      ex => ex.status === 'in_progress' || ex.status === 'pending'
    );
    if (firstActive > 0) setCurrentExIdx(firstActive);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  useEffect(() => {
    if (!restRunning) return;
    const t = setInterval(() => tickRest(sessionId), 1000);
    return () => clearInterval(t);
  }, [restRunning, sessionId]);

  const logSet = useMutation({
    mutationFn: (data: { seId: number; reps?: number; duration?: number; weight?: number; weightUnit: string; restSeconds?: number; isAssisted?: boolean }) =>
      api.post(`/workouts/session-exercises/${data.seId}/sets`, {
        actual_reps: data.reps,
        actual_duration_seconds: data.duration,
        actual_weight_value: data.weight,
        actual_weight_unit: data.weightUnit,
        actual_rest_seconds: data.restSeconds,
        is_assisted: data.isAssisted ? 1 : 0,
      }),
    onSuccess: () => refetch(),
  });

  const updateSet = useMutation({
    mutationFn: (data: { setId: number; reps?: number; duration?: number; weight?: number; weightUnit: string; isAssisted?: boolean }) =>
      api.put(`/workouts/sets/${data.setId}`, {
        actual_reps: data.reps,
        actual_duration_seconds: data.duration,
        actual_weight_value: data.weight,
        actual_weight_unit: data.weightUnit,
        is_assisted: data.isAssisted ? 1 : 0,
      }),
    onSuccess: () => refetch(),
  });

  const addSet = useMutation({
    mutationFn: (data: { seId: number; currentTarget: number }) =>
      api.patch(`/workouts/session-exercises/${data.seId}`, { target_sets: data.currentTarget + 1 }),
    onSuccess: () => refetch(),
  });

  const completeSession = useMutation({
    mutationFn: () => api.put<WorkoutSession>(`/workouts/${sessionId}/finish`, { total_rest_seconds: elapsed }),
    onSuccess: (finished) => {
      clearSession(sessionId);
      qc.invalidateQueries({ queryKey: ['active-session', userId] });
      qc.invalidateQueries({ queryKey: ['workout-history', userId] });
      qc.invalidateQueries({ queryKey: ['daily-summary', userId] });
      setCompletedData(finished);
      setCaloriesOverride(String(finished.calories_burned ?? ''));
    },
  });

  const saveCaloriesOverride = useMutation({
    mutationFn: (kcal: number | null) => api.patch(`/workouts/${sessionId}`, { calories_burned: kcal }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-history', userId] });
      qc.invalidateQueries({ queryKey: ['daily-summary', userId] });
      exit();
    },
  });

  const abandonSession = useMutation({
    mutationFn: () => api.put(`/workouts/${sessionId}/abandon`, {}),
    onSuccess: () => { clearSession(sessionId); exit(); },
  });

  // Define exercises/currentEx before any conditional returns so the useEffects
  // below are always called in the same order (Rules of Hooks).
  const exercises = session?.exercises ?? [];
  const currentEx = exercises[currentExIdx] ?? null;

  // Keep currentSeIdRef up to date, and re-pin currentExIdx by SE id after any refetch
  // (e.g. after reorder, add exercise, swap) so the user doesn't land on the wrong exercise.
  useEffect(() => {
    if (currentEx) currentSeIdRef.current = currentEx.id;
  });
  useEffect(() => {
    if (currentSeIdRef.current == null) return;
    const idx = exercises.findIndex(ex => ex.id === currentSeIdRef.current);
    if (idx !== -1 && idx !== currentExIdx) setCurrentExIdx(idx);
  }, [exercises]);

  const activeExerciseId = currentEx?.exercise_id;
  const { data: exHistory } = useQuery({
    queryKey: ['ex-history', userId, activeExerciseId, sessionId],
    queryFn: () => api.get<{
      last_session: { id: number; completed_at: string; session_name: string } | null;
      last_sets: Array<{ set_number: number; actual_reps: number | null; actual_duration_seconds: number | null; actual_weight_value: number | null; actual_weight_unit: string; is_pb: number }>;
      pbs: Array<{ rep_count: number | null; weight_value: number | null; weight_unit: string; duration_seconds: number | null; achieved_at: string }>;
    }>(`/exercises/${activeExerciseId}/history?user_id=${userId}&current_session_id=${sessionId}`),
    enabled: !!activeExerciseId && !!userId,
    staleTime: 30_000,
  });

  if (!session) return <div className="flex items-center justify-center h-64 text-gray-500 text-sm">Loading…</div>;

  // ── Completion summary screen ──
  if (completedData) {
    const dur = completedData.completed_at
      ? Math.round((parseSQLiteLocal(completedData.completed_at).getTime() - parseSQLiteLocal(completedData.started_at).getTime()) / 1000)
      : elapsed;
    const exercisesCompleted = completedData.exercises?.filter(e => e.status === 'completed').length ?? 0;
    const setCount = completedData.exercises?.reduce((n, ex) => n + ex.sets.length, 0) ?? 0;
    const totalVolume = Math.round(
      completedData.exercises?.reduce((vol, ex) => {
        if (ex.exercise_type !== 'reps') return vol;
        return vol + ex.sets.reduce((sv, s) => {
          const kg = (s.actual_weight_unit === 'kg' ? 1 : 0.453592) * (s.actual_weight_value ?? 0);
          return sv + (s.actual_reps ?? 0) * kg;
        }, 0);
      }, 0) ?? 0
    );
    const estimatedCals = completedData.calories_burned;
    const overrideVal = caloriesOverride === '' ? null : Number(caloriesOverride);
    return (
      <div className={`${rootHeightClass} bg-gray-950 flex flex-col items-center justify-center p-6 space-y-6 overflow-y-auto`}>
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
          <div className="flex justify-between text-sm">
            <span className="text-gray-400">Sets logged</span>
            <span className="text-white font-medium">{setCount}</span>
          </div>
          {totalVolume > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-gray-400">Volume lifted</span>
              <span className="text-white font-medium">{totalVolume.toLocaleString()} kg</span>
            </div>
          )}
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

  const completedSets = currentEx?.sets.length ?? 0;
  const targetSets = currentEx?.target_sets ?? 0;
  const allDone = exercises.length > 0 && exercises.every(ex => ex.status === 'completed' || ex.status === 'skipped');

  const prevSet = currentEx?.sets[currentEx.sets.length - 1];

  function handleLogSet(data: { reps?: number; duration?: number; weight?: number; weightUnit: string; restSeconds?: number; isAssisted?: boolean }) {
    logSet.mutate({ seId: currentEx.id, ...data });
    const willComplete = completedSets + 1 >= targetSets;
    if (willComplete) {
      api.put(`/workouts/session-exercises/${currentEx.id}/complete`, {});
      const nextIdx = currentExIdx + 1;
      const restSecs = currentEx.rest_seconds;
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = setTimeout(() => {
        autoAdvanceRef.current = null;
        if (nextIdx < exercises.length) {
          setCurrentExIdx(nextIdx);
          startRest(sessionId, restSecs);
        }
      }, 500);
    }
  }

  function handleFinish() {
    if (allDone || exercises.length === 0) {
      completeSession.mutate();
    } else {
      setFinishConfirm(true);
    }
  }

  // Zone grouping for tabs
  function zoneOf(ex: SessionExercise): 'warmup' | 'workout' | 'cooldown' {
    if (ex.category === 'warmup') return 'warmup';
    if (ex.category === 'cooldown') return 'cooldown';
    return 'workout';
  }
  const hasWarmup = exercises.some(ex => zoneOf(ex) === 'warmup');
  const hasCooldown = exercises.some(ex => zoneOf(ex) === 'cooldown');
  const hasWorkout = exercises.some(ex => zoneOf(ex) === 'workout');
  const hasMultipleZones = [hasWarmup, hasWorkout, hasCooldown].filter(Boolean).length > 1;

  function tabLabel(name: string) {
    const words = name.split(' ');
    const two = words.slice(0, 2).join(' ');
    return two.length > 15 ? two.slice(0, 14) + '…' : two;
  }

  const restIsOver = restSecondsLeft === 0 && restRunning;
  const restLabel = restIsOver ? `+${restOvertime}s` : `${restSecondsLeft}s`;

  return (
    <div className={`${rootHeightClass} bg-gray-950 flex flex-col`}>
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
          {/* Persistent rest indicator — stays visible even when viewing a different
              exercise tab than the one the rich RestCard is anchored to */}
          {restRunning && (
            <div className={`flex items-center gap-1 text-xs font-bold tabular-nums ${restIsOver ? 'text-red-400' : 'text-blue-400'}`}>
              <Timer size={12} />
              <span>{restIsOver ? `+${restOvertime}s` : `${restSecondsLeft}s`}</span>
            </div>
          )}
          <Button size="sm" onClick={handleFinish} disabled={completeSession.isPending} className="bg-green-700 hover:bg-green-600 text-white text-xs px-3 py-1.5">
            {completeSession.isPending ? 'Saving…' : 'Finish'}
          </Button>
          <button onClick={() => setAbandonConfirm(true)} className="p-1.5 text-gray-600 hover:text-red-400 transition-colors">
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Exercise tabs — grouped by zone */}
      <div className="flex items-center gap-1.5 px-4 py-3 overflow-x-auto hide-scrollbar">
        {exercises.map((ex, i) => {
          const done = ex.status === 'completed' || ex.status === 'skipped';
          const zone = zoneOf(ex);
          const prevZone = i > 0 ? zoneOf(exercises[i - 1]) : null;
          const showZoneLabel = hasMultipleZones && zone !== prevZone;
          const zoneMeta = {
            warmup: { label: 'Warm', color: 'text-amber-600' },
            workout: { label: 'Work', color: 'text-indigo-400' },
            cooldown: { label: 'Cool', color: 'text-cyan-600' },
          }[zone];
          return (
            <span key={ex.id} className="flex items-center gap-1.5 shrink-0">
              {showZoneLabel && (
                <span className={`text-[9px] font-bold uppercase tracking-widest ${zoneMeta.color} border-l border-gray-700 pl-1.5`}>
                  {zoneMeta.label}
                </span>
              )}
              <button
                onClick={() => {
                  if (autoAdvanceRef.current) { clearTimeout(autoAdvanceRef.current); autoAdvanceRef.current = null; }
                  setCurrentExIdx(i);
                }}
                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  i === currentExIdx ? 'bg-indigo-600 text-white'
                  : done ? 'bg-green-900/40 text-green-400'
                  : 'bg-gray-800 text-gray-400'
                }`}
              >
                {tabLabel(ex.exercise_name)}{done && ' ✓'}
              </button>
            </span>
          );
        })}
        <button onClick={() => setAddExOpen(true)} className="shrink-0 px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-500 hover:text-white">
          <Plus size={12} />
        </button>
        {exercises.length > 1 && (
          <button onClick={() => setReorderOpen(true)} className="shrink-0 px-3 py-1.5 rounded-lg text-xs bg-gray-800 text-gray-500 hover:text-white" title="Reorder exercises">
            <GripVertical size={12} />
          </button>
        )}
      </div>


      {/* Current exercise. 2-column split only makes sense with the full device width — in
          pair split-screen mode each pane is already half-width, so stack vertically
          regardless of device orientation. */}
      {currentEx && (
        <div className={`flex-1 px-4 pb-4 space-y-4 ${
          sessionIdOverride ? '' : 'landscape:grid landscape:grid-cols-2 landscape:gap-4 landscape:items-start landscape:space-y-0'
        }`}>
          <ExerciseCard
            sessionId={sessionId}
            ex={currentEx}
            completedSets={completedSets}
            prevSet={prevSet}
            history={exHistory ?? null}
            onLogSet={handleLogSet}
            onUpdateSet={(setId, data) => updateSet.mutate({ setId, ...data })}
            onAddSet={() => addSet.mutate({ seId: currentEx.id, currentTarget: currentEx.target_sets })}
            loading={logSet.isPending}
            updateLoading={updateSet.isPending}
          />
          {/* Grouped into one grid item so landscape mode stacks Skip + Technique in
              the second column instead of leaving it empty below a lone button. */}
          <div className="space-y-4">
            {(() => {
              const isDone = currentEx.status === 'completed' || currentEx.status === 'skipped';
              const hasLoggedSets = completedSets > 0;
              const confirmingSkip = skipConfirmExId === currentEx.id;
              function doSkip() {
                api.put(`/workouts/session-exercises/${currentEx.id}/complete`, {});
                if (currentExIdx < exercises.length - 1) {
                  setCurrentExIdx(i => i + 1);
                  startRest(sessionId, currentEx.rest_seconds);
                }
                setSkipConfirmExId(null);
                refetch();
              }
              return (
                <>
                  {confirmingSkip ? (
                    <div className="flex gap-2">
                      <Button variant="secondary" size="sm" onClick={() => setSkipConfirmExId(null)} className="flex-1">Keep Going</Button>
                      <Button size="sm" onClick={doSkip} className="flex-1 bg-orange-800 hover:bg-orange-700 text-white">Skip</Button>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => hasLoggedSets ? setSkipConfirmExId(currentEx.id) : doSkip()}
                      className="w-full"
                    >
                      <SkipForward size={13} />
                      {hasLoggedSets ? 'Skip Remaining Sets' : 'Skip Exercise'}
                    </Button>
                  )}
                  {!isDone && !hasLoggedSets && !confirmingSkip && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setSwapOpen(true)}
                      className="w-full"
                    >
                      <ArrowLeftRight size={13} /> Swap Exercise
                    </Button>
                  )}
                </>
              );
            })()}

            {/* Technique — always visible, no tap-to-reveal */}
            {(currentEx.description || currentEx.gif_url) && (
              <div className="rounded-xl border border-indigo-800/40 bg-indigo-950/20 p-3 space-y-2.5">
                <p className="flex items-center gap-1 text-xs font-semibold text-indigo-400 uppercase tracking-wide">
                  <BookOpen size={11} /> Technique
                </p>
                {currentEx.description && (
                  <p className="text-sm text-gray-300 leading-relaxed">{currentEx.description}</p>
                )}
                {(currentEx.gif_url || currentEx.primary_muscles?.length > 0) && (
                  <div className="flex flex-col sm:flex-row gap-3 items-start">
                    {currentEx.gif_url && (
                      <div className="w-full sm:flex-1 rounded-lg overflow-hidden bg-gray-900">
                        <ExerciseAnimation gifUrl={currentEx.gif_url} name={currentEx.exercise_name} className="w-full" />
                      </div>
                    )}
                    {currentEx.primary_muscles?.length > 0 && (
                      <div className="flex flex-col items-center gap-1 sm:w-36 w-full">
                        <MuscleMap primary={currentEx.primary_muscles} secondary={currentEx.secondary_muscles ?? []} className="w-32" />
                        <MuscleMapLegend mode="exercise" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Empty workout */}
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

      {/* All done */}
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

      {/* Abandon confirm */}
      {abandonConfirm && (
        <Modal open onClose={() => setAbandonConfirm(false)} title="Abandon Workout?" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-400">Your progress will not be saved. This can't be undone.</p>
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

      {/* Finish early confirm */}
      {finishConfirm && (
        <Modal open onClose={() => setFinishConfirm(false)} title="Finish Workout?" size="sm">
          <div className="space-y-4">
            <p className="text-sm text-gray-400">
              {exercises.filter(e => e.status !== 'completed' && e.status !== 'skipped').length} exercise(s) still pending.
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
          sessionId={sessionId}
          onClose={() => setAddExOpen(false)}
          onAdded={() => { refetch(); setAddExOpen(false); }}
        />
      )}

      {/* Swap exercise */}
      {swapOpen && currentEx && (
        <SwapExerciseModal
          seId={currentEx.id}
          currentEx={currentEx}
          onClose={() => setSwapOpen(false)}
          onSwapped={() => { refetch(); setSwapOpen(false); }}
        />
      )}

      {/* Reorder exercises */}
      {reorderOpen && (
        <ReorderExercisesModal
          exercises={exercises}
          onClose={() => setReorderOpen(false)}
          onReordered={() => { refetch(); }}
        />
      )}
    </div>
  );
}

// ─── ExerciseCard ─────────────────────────────────────────────────────────────

const CATEGORY_META: Record<string, { label: string; color: string }> = {
  warmup:   { label: 'Warmup',   color: 'text-amber-500' },
  cooldown: { label: 'Cooldown', color: 'text-cyan-500' },
  strength: { label: 'Strength', color: 'text-blue-400' },
  cardio:   { label: 'Cardio',   color: 'text-purple-400' },
};

type ExHistory = {
  last_session: { id: number; completed_at: string; session_name: string } | null;
  last_sets: Array<{ set_number: number; actual_reps: number | null; actual_duration_seconds: number | null; actual_weight_value: number | null; actual_weight_unit: string; is_pb: number; is_assisted?: number }>;
  pbs: Array<{ rep_count: number | null; weight_value: number | null; weight_unit: string; duration_seconds: number | null; achieved_at: string }>;
} | null;

function ExerciseCard({ sessionId, ex, completedSets, prevSet, history, onLogSet, onUpdateSet, onAddSet, loading, updateLoading }: {
  sessionId: number;
  ex: SessionExercise;
  completedSets: number;
  prevSet?: SetLog;
  history: ExHistory;
  onLogSet: (data: { reps?: number; duration?: number; weight?: number; weightUnit: string; restSeconds?: number; isAssisted?: boolean }) => void;
  onUpdateSet: (setId: number, data: { reps?: number; duration?: number; weight?: number; weightUnit: string; isAssisted?: boolean }) => void;
  onAddSet: () => void;
  loading: boolean;
  updateLoading: boolean;
}) {
  const { stopRest } = useWorkoutStore();
  const { restRunning, restSecondsLeft, restTargetSeconds, restOvertime } = useWorkoutStore(s => s.getSession(sessionId));

  const [reps, setReps] = useState(String(ex.target_reps ?? ''));
  const [duration, setDuration] = useState(String(ex.target_duration_seconds ?? ''));
  const [weight, setWeight] = useState(String(ex.target_weight_value ?? ''));
  const [weightUnit, setWeightUnit] = useState(ex.target_weight_unit ?? 'lb');
  const [isAssisted, setIsAssisted] = useState(false);
  const [editingSetId, setEditingSetId] = useState<number | null>(null);
  const [editReps, setEditReps] = useState('');
  const [editDuration, setEditDuration] = useState('');
  const [editWeight, setEditWeight] = useState('');
  const [editWeightUnit, setEditWeightUnit] = useState('lb');
  const [editIsAssisted, setEditIsAssisted] = useState(false);
  const [phase, setPhase] = useState<'active' | 'resting'>('active');
  const [restStartTs, setRestStartTs] = useState<number | null>(null);
  const [restElapsed, setRestElapsed] = useState(0);
  const [pendingRestSeconds, setPendingRestSeconds] = useState<number | undefined>(undefined);
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerStartTs, setTimerStartTs] = useState<number | null>(null);
  const [timerElapsed, setTimerElapsed] = useState(0);
  const historyPrefilledRef = useRef(false);

  // Reset on exercise change
  useEffect(() => {
    setReps(String(ex.target_reps ?? ''));
    setDuration(String(ex.target_duration_seconds ?? ''));
    setWeight(String(ex.target_weight_value ?? ''));
    setWeightUnit(ex.target_weight_unit ?? 'lb');
    setIsAssisted(false);
    setEditingSetId(null);
    setPhase('active');
    setRestStartTs(null);
    setRestElapsed(0);
    setPendingRestSeconds(undefined);
    setTimerRunning(false);
    setTimerStartTs(null);
    setTimerElapsed(0);
    historyPrefilledRef.current = false;
  }, [ex.id]);

  // Pre-fill inputs from last session when history arrives (only before first set is logged)
  useEffect(() => {
    if (!history?.last_sets?.length || completedSets > 0 || historyPrefilledRef.current) return;
    const filtered = isTimed
      ? history.last_sets.filter(s => s.actual_duration_seconds)
      : history.last_sets.filter(s => s.actual_weight_value != null && s.actual_weight_value > 0);
    if (filtered.length === 0) return;
    historyPrefilledRef.current = true;
    const first = filtered[0];
    if (isTimed) {
      setDuration(String(first.actual_duration_seconds ?? ''));
    } else {
      setReps(String(first.actual_reps ?? ''));
      setWeight(String(first.actual_weight_value ?? ''));
      setWeightUnit(first.actual_weight_unit ?? 'lb');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history]);

  // Live reference timer for timed exercises (mostly warmup/cooldown holds)
  useEffect(() => {
    if (!timerRunning || timerStartTs === null) return;
    const t = setInterval(() => setTimerElapsed(Math.floor((Date.now() - timerStartTs) / 1000)), 1000);
    return () => clearInterval(t);
  }, [timerRunning, timerStartTs]);

  // Per-exercise rest elapsed counter
  useEffect(() => {
    if (phase !== 'resting' || restStartTs === null) return;
    const t = setInterval(() => {
      setRestElapsed(Math.floor((Date.now() - restStartTs) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [phase, restStartTs]);

  const isTimed = ex.exercise_type === 'timed';
  const isDone = ex.status === 'completed' || ex.status === 'skipped';

  // Reset phase to active when an exercise is re-opened after completion (Add Extra Set flow).
  // Must come after isDone is declared.
  const prevIsDoneRef = useRef(false);
  useEffect(() => {
    const wasJustReopened = prevIsDoneRef.current && !isDone;
    prevIsDoneRef.current = isDone;
    if (wasJustReopened) {
      setPhase('active');
      setRestStartTs(null);
      setRestElapsed(0);
    }
  }, [isDone]);
  // Gate: don't show set form until user explicitly starts first set (when global rest is running)
  const inBetweenExRest = completedSets === 0 && !isDone && restRunning;
  const globalRestIsOver = restSecondsLeft === 0 && restRunning;
  const catMeta = ex.category ? CATEGORY_META[ex.category] : null;

  function startEdit(set: SetLog) {
    setEditingSetId(set.id);
    setEditReps(String(set.actual_reps ?? ''));
    setEditDuration(String(set.actual_duration_seconds ?? ''));
    setEditWeight(String(set.actual_weight_value ?? ''));
    setEditWeightUnit(set.actual_weight_unit ?? 'lb');
    setEditIsAssisted(!!set.is_assisted);
  }

  function saveEdit(set: SetLog) {
    onUpdateSet(set.id, {
      reps: isTimed ? undefined : (parseInt(editReps) || undefined),
      duration: isTimed ? (parseFloat(editDuration) || undefined) : undefined,
      weight: editWeight ? parseFloat(editWeight) : undefined,
      weightUnit: editWeightUnit,
      isAssisted: editIsAssisted,
    });
    setEditingSetId(null);
  }

  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-5 space-y-4">
      {/* Exercise name, category, muscle pills */}
      <div>
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="flex items-start gap-2 min-w-0">
            {isTimed
              ? <Timer size={16} className="text-purple-400 shrink-0 mt-0.5" />
              : <Dumbbell size={16} className="text-blue-400 shrink-0 mt-0.5" />}
            <div className="min-w-0">
              <h2 className="text-lg font-bold text-white leading-tight">{ex.exercise_name}</h2>
              {catMeta && (
                <span className={`text-[10px] font-semibold uppercase tracking-wide ${catMeta.color}`}>
                  {catMeta.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Muscle pills — always visible */}
        {(ex.primary_muscles?.length > 0 || ex.secondary_muscles?.length > 0) && (
          <div className="flex flex-wrap gap-1 mt-1.5 pl-6">
            {ex.primary_muscles?.map(m => (
              <span key={m} className="px-1.5 py-0.5 bg-indigo-900/40 text-indigo-300 text-[10px] rounded-full border border-indigo-800/40">
                {m}
              </span>
            ))}
            {ex.secondary_muscles?.map(m => (
              <span key={m} className="px-1.5 py-0.5 bg-gray-800 text-gray-500 text-[10px] rounded-full">
                {m}
              </span>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between text-sm mt-2">
          <div className="flex items-center gap-3">
            <span className="text-indigo-400 font-semibold">{completedSets}/{ex.target_sets} sets done</span>
            {isTimed
              ? <span className="text-gray-400">Target: {ex.target_duration_seconds}s</span>
              : <span className="text-gray-400">Target: {ex.target_reps} reps @ {ex.target_weight_value || '—'}{ex.target_weight_unit}</span>}
          </div>
          <button
            onClick={onAddSet}
            className="flex items-center gap-0.5 text-[11px] text-indigo-400/70 hover:text-indigo-300 transition-colors"
            title="Add an extra set"
          >
            <Plus size={11} /> Set
          </button>
        </div>

        {/* Previous session + PB context */}
        {(() => {
          const rawSets = history?.last_sets ?? [];
          const pbs = history?.pbs ?? [];
          const lastSets = isTimed
            ? rawSets.filter(s => s.actual_duration_seconds)
            : rawSets.filter(s => s.actual_weight_value && s.actual_weight_value > 0);
          // PB is now tracked at the weight level only (one row per exercise); rep_count
          // on the row is just a reference for the best reps achieved at that top weight.
          const targetRepPB = pbs[0] ?? null;
          if (lastSets.length === 0 && !targetRepPB) return null;
          return (
            <div className="mt-2.5 pt-2.5 border-t border-gray-800 flex flex-wrap gap-x-5 gap-y-1.5">
              {lastSets.length > 0 && (
                <div className="flex items-start gap-1.5 min-w-0">
                  <Clock size={11} className="text-gray-600 mt-0.5 shrink-0" />
                  <div className="min-w-0">
                    <p className="text-[10px] text-gray-600 uppercase tracking-wide leading-none mb-0.5">Last session</p>
                    <p className="text-xs text-gray-300 leading-snug">
                      {lastSets.map((s, i) => (
                        <span key={i} className="inline-flex items-center gap-0.5">
                          {i > 0 && <span className="text-gray-700 mx-0.5">·</span>}
                          {isTimed ? `${s.actual_duration_seconds}s` : `${s.actual_reps}×${s.actual_weight_value}${s.actual_weight_unit}`}
                          {!!s.is_assisted && <span className="text-orange-400 text-[9px] font-bold ml-0.5" title="Assisted / not clean">A</span>}
                        </span>
                      ))}
                    </p>
                  </div>
                </div>
              )}
              {targetRepPB && (() => {
                // Three mutually-exclusive PB shapes: weighted (weight_value > 0), timed
                // (duration_seconds set), or bodyweight reps-only (weight_value 0/null, no duration).
                const isWeighted = targetRepPB.weight_value != null && targetRepPB.weight_value > 0;
                const isTimedPb = targetRepPB.duration_seconds != null;
                return (
                  <div className="flex items-start gap-1.5">
                    <Trophy size={11} className="text-amber-500 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-[10px] text-gray-600 uppercase tracking-wide leading-none mb-0.5">
                        PR{isWeighted && targetRepPB.rep_count ? ` · ${targetRepPB.rep_count} reps` : ''}
                      </p>
                      <p className="text-xs text-amber-400 font-semibold leading-snug">
                        {isWeighted
                          ? `${targetRepPB.weight_value}${targetRepPB.weight_unit}`
                          : isTimedPb
                          ? `${targetRepPB.duration_seconds}s`
                          : `${targetRepPB.rep_count} reps`}
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}
      </div>

      {/* Logged sets */}
      {ex.sets.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Logged Sets</p>
          {ex.sets.map((set) => (
            <div key={set.id} className="flex items-center justify-between bg-gray-800 rounded-xl px-3 py-2">
              {editingSetId === set.id ? (
                <div className="flex-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-gray-500 w-6">#{set.set_number}</span>
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
                    type="button"
                    onClick={() => setEditIsAssisted(v => !v)}
                    className={`flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold transition-all duration-200 select-none ${
                      editIsAssisted
                        ? 'bg-orange-500/20 text-orange-300 border border-orange-400/60 shadow-[0_0_8px_rgba(249,115,22,0.3)]'
                        : 'text-gray-600 border border-white/10 hover:text-gray-400'
                    }`}
                  >
                    <span>{editIsAssisted ? '⚡' : '◦'}</span>
                    {editIsAssisted ? 'Assisted' : 'Clean'}
                  </button>
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
                    {!!set.is_assisted && (
                      <span className="text-[10px] font-bold text-orange-400 px-1 py-0.5 rounded bg-orange-900/30" title="Assisted / not clean">
                        assisted
                      </span>
                    )}
                    {set.is_pb === 1 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-yellow-400">
                        <Trophy size={10} /> PR!
                      </span>
                    )}
                    {set.is_pb === 2 && (
                      <span className="flex items-center gap-0.5 text-[10px] font-bold text-gray-400">
                        <Trophy size={10} /> = PR
                      </span>
                    )}
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

      {/* Between-exercise rest — same RestCard treatment as between-set rest below */}
      {inBetweenExRest && (
        <RestCard
          target={restTargetSeconds}
          remaining={restSecondsLeft}
          overtimeSeconds={restOvertime}
          isOver={globalRestIsOver}
          label="Between exercises"
          buttonLabel="Start Set 1"
          onStart={() => stopRest(sessionId)}
        />
      )}

      {/* Between-set rest */}
      {!isDone && !inBetweenExRest && phase === 'resting' && (() => {
        const target = ex.rest_seconds ?? 90;
        const remaining = Math.max(0, target - restElapsed);
        const overtimeSeconds = Math.max(0, restElapsed - target);
        const isOver = restElapsed >= target;
        return (
          <RestCard
            target={target}
            remaining={remaining}
            overtimeSeconds={overtimeSeconds}
            isOver={isOver}
            label="Between sets"
            buttonLabel={`Start Set ${completedSets + 1}`}
            onStart={() => { setPendingRestSeconds(restElapsed); setPhase('active'); }}
          />
        );
      })()}

      {/* Set input form */}
      {!isDone && !inBetweenExRest && phase === 'active' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Set {completedSets + 1}</p>
            {pendingRestSeconds !== undefined && (
              <p className="text-[11px] text-indigo-400/70">Rest: {pendingRestSeconds}s</p>
            )}
          </div>

          {prevSet && completedSets === 0 && (
            <p className="text-xs text-gray-600">
              Last: {isTimed
                ? `${prevSet.actual_duration_seconds}s`
                : `${prevSet.actual_reps} × ${prevSet.actual_weight_value ?? 0}${prevSet.actual_weight_unit}`}
            </p>
          )}

          {isTimed ? (() => {
            const target = ex.target_duration_seconds ?? 30;
            const timerOver = timerElapsed >= target;
            const timerRemaining = Math.max(0, target - timerElapsed);
            const timerOvertime = Math.max(0, timerElapsed - target);
            return (
              <div className="space-y-2">
                <div className={`border rounded-2xl p-3 text-center space-y-1 ${
                  timerRunning ? (timerOver ? 'bg-red-950/40 border-red-800/50' : 'bg-blue-950/60 border-blue-800/50') : 'bg-gray-800/50 border-gray-700'
                }`}>
                  <p className={`text-3xl font-bold tabular-nums ${timerRunning ? (timerOver ? 'text-red-400' : 'text-white') : 'text-gray-500'}`}>
                    {timerRunning ? (timerOver ? `+${timerOvertime}` : timerRemaining) : target}s
                  </p>
                  <p className={`text-[11px] ${timerRunning && timerOver ? 'text-red-400/60' : 'text-gray-600'}`}>
                    {timerRunning ? (timerOver ? 'Overtime — stop when ready' : 'Counting down…') : `Target: ${target}s — use as a live reference`}
                  </p>
                </div>
                <Button
                  variant={timerRunning ? undefined : 'secondary'}
                  className={`w-full ${timerRunning ? (timerOver ? 'bg-red-700 hover:bg-red-600' : 'bg-blue-600 hover:bg-blue-500') : ''}`}
                  onClick={() => {
                    if (timerRunning) {
                      setTimerRunning(false);
                      setDuration(String(timerElapsed));
                    } else {
                      setTimerRunning(true);
                      setTimerStartTs(Date.now());
                      setTimerElapsed(0);
                    }
                  }}
                >
                  <Timer size={14} /> {timerRunning ? 'Stop Timer' : 'Start Timer'}
                </Button>
                <Input label="Duration (seconds)" type="number" value={duration} onChange={e => setDuration(e.target.value)} suffix="s" />
              </div>
            );
          })() : (
            <div className="grid grid-cols-3 gap-2">
              <Input label="Reps" type="number" value={reps} onChange={e => setReps(e.target.value)} />
              <Input label="Weight" type="number" value={weight} onChange={e => setWeight(e.target.value)} />
              <Select label="Unit" value={weightUnit} onChange={e => setWeightUnit(e.target.value)}
                options={[{ value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }]} />
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setIsAssisted(v => !v)}
              className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 select-none ${
                isAssisted
                  ? 'bg-orange-500/20 text-orange-300 border border-orange-400/60 shadow-[0_0_12px_rgba(249,115,22,0.35)]'
                  : 'text-gray-600 border border-white/10 hover:text-gray-400 hover:border-white/20'
              }`}
            >
              {isAssisted && (
                <span className="absolute inset-0 rounded-full animate-ping bg-orange-500/15 pointer-events-none" />
              )}
              <span className="text-sm leading-none">{isAssisted ? '⚡' : '◦'}</span>
              {isAssisted ? 'Assisted' : 'Clean rep'}
            </button>
          </div>

          <Button
            onClick={() => {
              const restSecs = pendingRestSeconds;
              const assisted = isAssisted;
              setPendingRestSeconds(undefined);
              setIsAssisted(false);
              onLogSet({
                reps: isTimed ? undefined : (parseInt(reps) || undefined),
                duration: isTimed ? (parseFloat(duration) || undefined) : undefined,
                weight: weight ? parseFloat(weight) : undefined,
                weightUnit,
                restSeconds: restSecs,
                isAssisted: assisted,
              });
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
            {completedSets + 1 < ex.target_sets
              ? `Log Set ${completedSets + 1} — ${completedSets + 2}/${ex.target_sets} up next`
              : 'Log Final Set'}
          </Button>
        </div>
      )}

      {isDone && (
        <div className="space-y-2">
          <p className="text-xs text-green-400 text-center py-1">
            {ex.status === 'completed' ? '✓ Exercise complete' : '↷ Skipped'} — tap pencil to edit any set
          </p>
          {ex.status === 'completed' && (
            <button
              onClick={onAddSet}
              className="w-full py-1.5 rounded-xl text-xs text-indigo-400 border border-indigo-900/50 hover:bg-indigo-900/20 hover:border-indigo-700 transition-colors flex items-center justify-center gap-1"
            >
              <Plus size={11} /> Add Extra Set
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── SwapExerciseModal ────────────────────────────────────────────────────────

function SwapExerciseModal({ seId, currentEx, onClose, onSwapped }: {
  seId: number;
  currentEx: SessionExercise;
  onClose: () => void;
  onSwapped: () => void;
}) {
  const { data: exercises = [] } = useQuery({
    queryKey: ['exercises', ''],
    queryFn: () => api.get<Exercise[]>('/exercises'),
  });

  const [exerciseId, setExerciseId] = useState(0);
  const options = exercises.filter(e => e.id !== currentEx.exercise_id);

  const swap = useMutation({
    mutationFn: () => api.put(`/workouts/session-exercises/${seId}/swap`, { exercise_id: exerciseId }),
    onSuccess: onSwapped,
  });

  return (
    <Modal open onClose={onClose} title="Swap Exercise" size="md">
      <div className="space-y-3">
        <p className="text-sm text-gray-400">
          Replace <span className="text-white font-medium">{currentEx.exercise_name}</span> with:
        </p>
        <Select
          label="New Exercise"
          value={exerciseId}
          onChange={e => setExerciseId(Number(e.target.value))}
          options={[{ value: 0, label: '— pick an exercise —' }, ...options.map(e => ({ value: e.id, label: e.name }))]}
        />
        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={() => swap.mutate()}
            disabled={swap.isPending || exerciseId === 0}
            className="flex-1"
          >
            {swap.isPending ? 'Swapping…' : 'Swap Exercise'}
          </Button>
        </div>
      </div>
    </Modal>
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

// ─── ReorderExercisesModal ────────────────────────────────────────────────────

function ReorderExercisesModal({ exercises, onClose, onReordered }: {
  exercises: SessionExercise[]; onClose: () => void; onReordered: () => void;
}) {
  const sorted = [...exercises].sort((a, b) => a.order_index - b.order_index);

  const reorder = useMutation({
    mutationFn: ({ seId, swapWithId }: { seId: number; swapWithId: number }) =>
      api.put(`/workouts/session-exercises/${seId}/order`, { swap_with_id: swapWithId }),
    onSuccess: onReordered,
  });

  return (
    <Modal open onClose={onClose} title="Reorder Exercises" size="md">
      <div className="space-y-1">
        {sorted.map((ex, idx) => (
          <div key={ex.id} className="flex items-center gap-2 bg-gray-800 rounded-xl px-3 py-2.5">
            <span className="text-xs text-gray-600 w-5 shrink-0">{idx + 1}.</span>
            <p className="flex-1 text-sm text-white truncate">{ex.exercise_name}</p>
            {(ex.status === 'completed' || ex.status === 'skipped') && (
              <span className="text-[10px] text-green-500 shrink-0">done</span>
            )}
            <div className="flex flex-col shrink-0">
              <button
                disabled={idx === 0 || reorder.isPending}
                onClick={() => reorder.mutate({ seId: ex.id, swapWithId: sorted[idx - 1].id })}
                className="p-0.5 text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronUp size={14} />
              </button>
              <button
                disabled={idx === sorted.length - 1 || reorder.isPending}
                onClick={() => reorder.mutate({ seId: ex.id, swapWithId: sorted[idx + 1].id })}
                className="p-0.5 text-gray-600 hover:text-white disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronDown size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="pt-3">
        <Button variant="secondary" onClick={onClose} className="w-full">Done</Button>
      </div>
    </Modal>
  );
}
