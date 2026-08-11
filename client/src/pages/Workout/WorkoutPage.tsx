import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Play, Clock, Dumbbell, Plus, Trophy, History, Flame, Activity, Trash2, ChevronDown, ChevronUp, BarChart2, Timer, Calendar, Star, Pencil, X, GripVertical } from 'lucide-react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import { useWorkoutStore } from '../../store/appStore';
import type { Routine, WorkoutSession, User, WorkoutRegime } from '../../types';
import { formatDuration, parseSQLiteLocal } from '../../utils/units';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import { useToast } from '../../components/ui/Toast';

interface OutletCtx { userId: number; }

interface PB {
  id: number;
  exercise_id: number;
  exercise_name: string;
  exercise_type: string;
  rep_count: number | null;
  weight_value: number | null;
  weight_unit: string | null;
  duration_seconds: number | null;
  achieved_at: string;
}

const TABS = [
  { key: 'start',   icon: Play,     label: 'Start'   },
  { key: 'regimes', icon: Calendar, label: 'Regimes' },
  { key: 'history', icon: History,  label: 'History' },
  { key: 'pbs',     icon: Trophy,   label: 'PRs'     },
] as const;
type Tab = typeof TABS[number]['key'];

export default function WorkoutPage({ userId: propUserId }: { userId?: number }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setSession } = useWorkoutStore();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('start');
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<number | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);
  const [expandedRoutineId, setExpandedRoutineId] = useState<number | null>(null);

  const { data: user } = useQuery({
    queryKey: ['user', userId],
    queryFn: () => api.get<User>(`/users/${userId}`),
    enabled: !!userId,
  });

  const saveProfile = useMutation({
    mutationFn: (data: Partial<User>) => api.put(`/users/${userId}/profile`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['user', userId] });
      qc.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (err: Error) => toast(`Failed to save: ${err.message}`, 'error'),
  });

  const deleteSession = useMutation({
    mutationFn: (id: number) => api.delete(`/workouts/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-history', userId] });
      qc.invalidateQueries({ queryKey: ['daily-summary', userId] });
      setConfirmDeleteSessionId(null);
    },
  });

  const logActivity = useMutation({
    mutationFn: (data: { name: string; duration_minutes: number; calories_burned: number; date?: string }) =>
      api.post('/workouts/log-manual', { user_id: userId, ...data }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workout-history', userId] });
      qc.invalidateQueries({ queryKey: ['daily-summary', userId] });
      setLogActivityOpen(false);
    },
  });

  const { data: routines = [] } = useQuery({
    queryKey: ['routines', userId],
    queryFn: () => api.get<Routine[]>(`/routines/user/${userId}`),
    enabled: !!userId,
  });

  const activeRegimeId = user?.active_regime_id;
  const { data: activeRegime } = useQuery({
    queryKey: ['regime', activeRegimeId],
    queryFn: () => api.get<WorkoutRegime>(`/regimes/${activeRegimeId}`),
    enabled: !!activeRegimeId,
  });

  const { data: active } = useQuery({
    queryKey: ['active-session', userId],
    queryFn: () => api.get<WorkoutSession | null>(`/workouts/user/${userId}/active`),
    enabled: !!userId,
  });

  const { data: history = [] } = useQuery({
    queryKey: ['workout-history', userId],
    queryFn: () => api.get<WorkoutSession[]>(`/workouts/user/${userId}?limit=20`),
    enabled: !!userId,
  });

  const { data: pbs = [] } = useQuery({
    queryKey: ['pbs', userId],
    queryFn: () => api.get<PB[]>(`/workouts/user/${userId}/pbs`),
    enabled: !!userId,
  });

  const { data: expandedSession } = useQuery({
    queryKey: ['session-detail', expandedSessionId],
    queryFn: () => api.get<WorkoutSession>(`/workouts/${expandedSessionId}`),
    enabled: expandedSessionId !== null,
  });

  const startSession = useMutation({
    mutationFn: (routineId?: number) => api.post<WorkoutSession>('/workouts/start', {
      user_id: userId,
      routine_id: routineId ?? undefined,
    }),
    onSuccess: (session) => {
      setSession(session.id, userId);
      qc.invalidateQueries({ queryKey: ['active-session', userId] });
      navigate(`/workout/live/${session.id}`);
    },
  });

  // Map exercise_id → PB rows for that exercise (weighted PBs keyed further by rep_count)
  const pbsByExercise = useMemo(() => {
    const map: Record<number, PB[]> = {};
    for (const pb of pbs) {
      (map[pb.exercise_id] ??= []).push(pb);
    }
    return map;
  }, [pbs]);

  // Map routineId → most recent completed_at
  const lastDoneMap = useMemo(() => {
    const map: Record<number, Date> = {};
    for (const s of history) {
      if (s.routine_id && s.completed_at) {
        const d = parseSQLiteLocal(s.completed_at);
        if (!map[s.routine_id] || d > map[s.routine_id]) map[s.routine_id] = d;
      }
    }
    return map;
  }, [history]);

  function daysAgoLabel(date: Date): string {
    const diff = Math.floor((Date.now() - date.getTime()) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    if (diff < 7) return `${diff} days ago`;
    return `${Math.floor(diff / 7)}w ago`;
  }

  // Sort routines: by regime day_index when an active regime exists, otherwise recently done first
  const regimeDayIndex = useMemo(() => {
    const map: Record<number, number> = {};
    activeRegime?.days.forEach(d => { map[d.routine_id] = d.day_index; });
    return map;
  }, [activeRegime]);

  const sortedRoutines = useMemo(() => {
    const hasRegimeOrder = Object.keys(regimeDayIndex).length > 0;
    return [...routines].sort((a, b) => {
      if (hasRegimeOrder) {
        const aIdx = regimeDayIndex[a.id] ?? 999;
        const bIdx = regimeDayIndex[b.id] ?? 999;
        if (aIdx !== bIdx) return aIdx - bIdx;
      }
      const aT = lastDoneMap[a.id]?.getTime() ?? 0;
      const bT = lastDoneMap[b.id]?.getTime() ?? 0;
      if (bT !== aT) return bT - aT;
      return a.name.localeCompare(b.name);
    });
  }, [routines, lastDoneMap, regimeDayIndex]);

  const completedSessions = history.filter(s => s.status !== 'in_progress');

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-white">Workout</h1>

      {/* Tab bar */}
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(({ key, icon: Icon, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
              tab === key ? 'bg-gray-800 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <Icon size={13} />
            {label}
          </button>
        ))}
      </div>

      {/* Start tab */}
      {tab === 'start' && (
        <div className="space-y-4">
          {active && (
            <div className="bg-indigo-950 border border-indigo-800 rounded-2xl p-4">
              <p className="text-xs font-medium text-indigo-400 mb-1">Session in progress</p>
              <p className="text-sm font-semibold text-white">{active.name}</p>
              <p className="text-xs text-indigo-300 mt-0.5">
                Started {parseSQLiteLocal(active.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
              <Button onClick={() => navigate(`/workout/live/${active.id}`)} className="mt-3 w-full bg-indigo-600">
                <Play size={14} /> Resume Workout
              </Button>
            </div>
          )}

          {routines.length > 0 && !active && (
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Your Routines</h2>
              {sortedRoutines.map(r => {
                const lastDone = lastDoneMap[r.id];
                const isExpanded = expandedRoutineId === r.id;
                return (
                  <div key={r.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                    <div className="p-3.5 flex items-center justify-between">
                      <button
                        onClick={() => setExpandedRoutineId(isExpanded ? null : r.id)}
                        className="min-w-0 flex-1 mr-3 text-left flex items-center gap-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-white">{r.name}</p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {r.exercises.length} exercise{r.exercises.length !== 1 ? 's' : ''}
                            {lastDone && <span className="text-indigo-400/70"> · {daysAgoLabel(lastDone)}</span>}
                          </p>
                        </div>
                        {isExpanded ? <ChevronUp size={14} className="text-gray-600 shrink-0" /> : <ChevronDown size={14} className="text-gray-600 shrink-0" />}
                      </button>
                      <Button size="sm" onClick={() => startSession.mutate(r.id)}>
                        <Play size={12} /> Start
                      </Button>
                    </div>
                    {isExpanded && (() => {
                      const sorted = [...r.exercises].sort((a, b) => a.order_index - b.order_index);
                      const zoneOf = (cat: string) => cat === 'warmup' ? 'warmup' : cat === 'cooldown' ? 'cooldown' : 'workout';
                      const ZONE_META: Record<string, { label: string; color: string; bg: string }> = {
                        warmup:   { label: 'Warm-Up',   color: 'text-amber-400',  bg: 'bg-amber-950/20 border-amber-900/30' },
                        workout:  { label: 'Workout',   color: 'text-indigo-400', bg: 'bg-indigo-950/10 border-indigo-900/20' },
                        cooldown: { label: 'Cool-Down', color: 'text-cyan-400',   bg: 'bg-cyan-950/20 border-cyan-900/30' },
                      };
                      let lastZone = '';
                      return (
                        <div className="border-t border-gray-800">
                          {sorted.map((re, idx) => {
                            const zone = zoneOf(re.category ?? 'strength');
                            const showHeader = zone !== lastZone;
                            lastZone = zone;
                            const zm = ZONE_META[zone];
                            return (
                              <div key={re.id}>
                                {showHeader && (
                                  <div className={`px-3.5 py-1 border-b ${zm.bg}`}>
                                    <span className={`text-[9px] font-bold uppercase tracking-widest ${zm.color}`}>{zm.label}</span>
                                  </div>
                                )}
                                <div className="px-3.5 py-2 flex items-center gap-2 text-xs border-b border-gray-800/40 last:border-0">
                                  <span className="text-gray-600 w-4 shrink-0">{idx + 1}.</span>
                                  <span className="text-gray-300 flex-1 truncate">{re.exercise_name}</span>
                                  <span className="text-gray-500 shrink-0">
                                    {re.sets} × {re.exercise_type === 'timed' ? `${re.duration_seconds}s` : `${re.reps}${re.weight_value ? ` @ ${re.weight_value}${re.weight_unit}` : ''}`}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              <Button onClick={() => startSession.mutate(undefined)} variant="secondary" className="w-full" size="sm">
                <Plus size={14} /> Ad-hoc (no routine)
              </Button>
            </div>
          )}

          {routines.length === 0 && !active && (
            <div className="space-y-3">
              <Button onClick={() => startSession.mutate(undefined)} className="w-full" size="lg">
                <Play size={16} /> Start Tracked Workout
              </Button>
              <p className="text-sm text-gray-500 text-center">
                Or{' '}
                <button className="text-indigo-400 underline" onClick={() => navigate('/library/routines')}>
                  build a routine
                </button>{' '}
                first for structured workouts.
              </p>
            </div>
          )}

          {!active && (
            <div className="border-t border-gray-800/50 pt-3">
              <Button
                onClick={() => setLogActivityOpen(true)}
                className="w-full bg-gray-700 hover:bg-gray-600 border border-gray-600"
                size="sm"
              >
                <Activity size={14} /> Log Activity (walk, run, hike…)
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Regimes tab */}
      {tab === 'regimes' && user && (
        <RegimesTab key={userId} userId={userId} user={user} onSetActive={id => saveProfile.mutate({ active_regime_id: id } as Partial<User>)} />
      )}

      {/* History tab */}
      {tab === 'history' && (
        <div className="space-y-2">
          {completedSessions.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">No completed workouts yet.</p>
          )}
          {completedSessions.map(session => {
            const duration = session.completed_at
              ? Math.max(0, Math.round((parseSQLiteLocal(session.completed_at).getTime() - parseSQLiteLocal(session.started_at).getTime()) / 1000))
              : 0;
            const isExpanded = expandedSessionId === session.id;
            const detail = isExpanded ? expandedSession : null;
            return (
              <div key={session.id} className="bg-gray-900 rounded-xl border border-gray-800 overflow-hidden">
                <div className="p-3.5">
                  <div className="flex items-start justify-between">
                    <button
                      onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                      className="flex-1 min-w-0 mr-2 text-left"
                    >
                      <p className="text-sm font-medium text-white">{session.name}</p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {parseSQLiteLocal(session.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                    </button>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-right text-xs text-gray-500">
                        <div className="flex items-center gap-1"><Clock size={11} />{formatDuration(duration)}</div>
                        {session.calories_burned && (
                          <div className="flex items-center gap-1 mt-0.5 justify-end">
                            <Flame size={11} />{Math.round(session.calories_burned)} kcal
                          </div>
                        )}
                      </div>
                      {confirmDeleteSessionId === session.id ? (
                        <div className="flex items-center gap-1">
                          <button onClick={() => deleteSession.mutate(session.id)}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-red-900/50 text-red-400 hover:bg-red-900 transition-colors">
                            Del
                          </button>
                          <button onClick={() => setConfirmDeleteSessionId(null)}
                            className="text-[11px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors">
                            No
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDeleteSessionId(session.id)}
                          className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-700 hover:text-red-400 transition-colors">
                          <Trash2 size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                        className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-600 hover:text-gray-300 transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </button>
                    </div>
                  </div>
                  {session.status === 'abandoned' && (
                    <span className="mt-1.5 inline-block text-[10px] px-2 py-0.5 bg-gray-800 text-gray-500 rounded-full">abandoned</span>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-800">
                    {!detail ? (
                      <p className="text-xs text-gray-600 text-center py-4">Loading…</p>
                    ) : detail.exercises && detail.exercises.length > 0 ? (() => {
                      const ZONE_META: Record<string, { label: string; color: string; bg: string }> = {
                        warmup:   { label: 'Warm-Up',   color: 'text-amber-400',  bg: 'bg-amber-950/20 border-amber-900/30' },
                        workout:  { label: 'Workout',   color: 'text-indigo-400', bg: 'bg-indigo-950/10 border-indigo-900/20' },
                        cooldown: { label: 'Cool-Down', color: 'text-cyan-400',   bg: 'bg-cyan-950/20 border-cyan-900/30' },
                      };
                      const zoneOf = (cat?: string) => cat === 'warmup' ? 'warmup' : cat === 'cooldown' ? 'cooldown' : 'workout';
                      let lastZone = '';
                      return (
                      <div className="divide-y divide-gray-800/50">
                        {detail.exercises.map(ex => {
                          const zone = zoneOf(ex.category);
                          const showHeader = zone !== lastZone;
                          lastZone = zone;
                          const zm = ZONE_META[zone];
                          return (
                          <div key={ex.id}>
                            {showHeader && (
                              <div className={`px-4 py-1 border-b ${zm.bg}`}>
                                <span className={`text-[9px] font-bold uppercase tracking-widest ${zm.color}`}>{zm.label}</span>
                              </div>
                            )}
                          <div className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              {ex.exercise_type === 'timed'
                                ? <Timer size={11} className="text-purple-400 shrink-0" />
                                : <BarChart2 size={11} className="text-blue-400 shrink-0" />}
                              <p className="text-xs font-medium text-white">{ex.exercise_name}</p>
                              <span className="text-[10px] text-gray-600 ml-auto">{ex.sets?.length ?? 0} sets</span>
                            </div>
                            {ex.sets && ex.sets.length > 0 ? (
                              <div className="space-y-1">
                                {ex.sets.map((set: any) => {
                                  // PB is tracked at the weight level (one row per exercise);
                                  // rep_count on the row is just a "best reps at top weight" reference.
                                  const exPbs = pbsByExercise[ex.exercise_id] ?? [];
                                  const matchingPb = ex.exercise_type === 'timed'
                                    ? exPbs.find(p => p.rep_count == null)
                                    : (set.actual_weight_value && set.actual_weight_value > 0
                                        ? exPbs.find(p => p.weight_value != null && p.weight_value > 0)
                                        : exPbs.find(p => !p.weight_value));
                                  const pbDeltaLabel = (() => {
                                    if (set.is_pb) return null; // already flagged as PR/=PR below
                                    if (!matchingPb) return null;
                                    if (ex.exercise_type === 'timed') {
                                      const diff = (matchingPb.duration_seconds ?? 0) - (set.actual_duration_seconds ?? 0);
                                      return diff > 0 ? `−${diff}s vs PB (${matchingPb.duration_seconds}s)` : null;
                                    }
                                    const diff = (matchingPb.weight_value ?? 0) - (set.actual_weight_value ?? 0);
                                    return diff > 0 ? `−${diff}${matchingPb.weight_unit} vs PB (${matchingPb.weight_value}${matchingPb.weight_unit})` : null;
                                  })();
                                  return (
                                    <div key={set.id} className="flex items-center gap-2 text-[11px] text-gray-400 flex-wrap">
                                      <span className="text-gray-600 w-8 shrink-0">Set {set.set_number}</span>
                                      {ex.exercise_type === 'timed' ? (
                                        <span className="font-medium text-white">{set.actual_duration_seconds}s</span>
                                      ) : (
                                        <>
                                          <span className="font-medium text-white">{set.actual_reps} reps</span>
                                          {set.actual_weight_value && (
                                            <span className="text-gray-400">@ {set.actual_weight_value} {set.actual_weight_unit}</span>
                                          )}
                                        </>
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
                                      {pbDeltaLabel && (
                                        <span className="text-[10px] text-gray-600">{pbDeltaLabel}</span>
                                      )}
                                      {set.actual_rest_seconds != null && (
                                        <span className="text-indigo-400/60 ml-auto">{set.actual_rest_seconds}s rest</span>
                                      )}
                                      {set.notes && <span className="text-gray-600 italic">{set.notes}</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-600">No sets logged.</p>
                            )}
                          </div>
                          </div>
                        );
                        })}
                      </div>
                      );
                    })() : (
                      <p className="text-xs text-gray-600 text-center py-4">No exercises logged for this session.</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {logActivityOpen && (
        <LogActivityModal
          open
          onClose={() => setLogActivityOpen(false)}
          onSave={(data) => logActivity.mutate(data)}
          loading={logActivity.isPending}
        />
      )}

      {/* Personal Records tab */}
      {tab === 'pbs' && (
        <div className="space-y-2">
          {pbs.length === 0 && (
            <p className="text-sm text-gray-500 text-center py-8">
              No personal records yet. Complete a workout to set some!
            </p>
          )}
          {pbs.map(pb => (
            <div key={pb.id} className="bg-gray-900 rounded-xl border border-gray-800 p-3.5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <Trophy size={13} className="text-yellow-400" />
                    <p className="text-sm font-medium text-white">{pb.exercise_name}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    {parseSQLiteLocal(pb.achieved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right">
                  {pb.weight_value != null && pb.weight_value > 0 ? (
                    <p className="text-sm font-semibold text-yellow-400">
                      {pb.rep_count} × {pb.weight_value} {pb.weight_unit}
                    </p>
                  ) : pb.duration_seconds != null ? (
                    <p className="text-sm font-semibold text-yellow-400">
                      {formatDuration(pb.duration_seconds)}
                    </p>
                  ) : pb.rep_count != null ? (
                    <p className="text-sm font-semibold text-yellow-400">{pb.rep_count} reps</p>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

    </div>
  );
}

// ─── Log Activity Modal ───────────────────────────────────────────────────────

const ACTIVITY_PRESETS = [
  'Walk', 'Run', 'Hike', 'Bike Ride', 'Swim',
  'Strength Training', 'HIIT', 'Yoga', 'Stretching', 'Yard Work', 'Other',
];

function fmt(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

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
            {ACTIVITY_PRESETS.map(preset => (
              <button
                key={preset}
                onClick={() => setName(preset)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                  name === preset ? 'bg-indigo-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
          <Input
            label="Or type a custom name"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Pickleball, CrossFit, Rowing…"
          />
        </div>

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
            <p className="text-[11px] text-indigo-400 mt-1">
              Logging for {new Date(activityDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Duration (min)"
            type="number"
            value={duration}
            onChange={e => setDuration(e.target.value)}
            placeholder="e.g. 45"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
          <Input
            label="Calories burned *"
            type="number"
            value={calories}
            onChange={e => setCalories(e.target.value)}
            placeholder="e.g. 300"
            onKeyDown={e => e.key === 'Enter' && handleSave()}
          />
        </div>

        <p className="text-[11px] text-gray-600">
          Tip: use a fitness app or wearable for accurate values, or rough averages (walk ~4 kcal/min, run ~10 kcal/min, strength ~5–8 kcal/min).
        </p>

        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button
            onClick={handleSave}
            disabled={!canSave || loading}
            className="flex-1"
          >
            <Flame size={14} /> {loading ? 'Saving…' : 'Log Activity'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Regimes ────────────────────────────────────────────────────────────────

function RegimesTab({ userId, user, onSetActive }: { userId: number; user: User; onSetActive: (id: number | null) => void }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [editing, setEditing] = useState<WorkoutRegime | 'new' | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const { data: regimes = [] } = useQuery({
    queryKey: ['regimes', userId],
    queryFn: () => api.get<WorkoutRegime[]>(`/regimes/user/${userId}`),
    enabled: !!userId,
  });

  const { data: routines = [] } = useQuery({
    queryKey: ['routines', userId],
    queryFn: () => api.get<Routine[]>(`/routines/user/${userId}`),
    enabled: !!userId,
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['regimes', userId] });

  const saveRegime = useMutation({
    mutationFn: (data: { id?: number; name: string; notes?: string; routine_ids: number[] }) =>
      data.id
        ? api.put<WorkoutRegime>(`/regimes/${data.id}`, data)
        : api.post<WorkoutRegime>('/regimes', { user_id: userId, ...data }),
    onSuccess: () => { invalidate(); setEditing(null); },
  });

  const deleteRegime = useMutation({
    mutationFn: (id: number) => api.delete(`/regimes/${id}`),
    onSuccess: (_, id) => {
      invalidate();
      setConfirmDeleteId(null);
      if (user.active_regime_id === id) onSetActive(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Workout Regimes</p>
        <button onClick={() => setEditing('new')} className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300">
          <Plus size={12} /> New Regime
        </button>
      </div>

      {regimes.length === 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 border-dashed p-6 text-center">
          <p className="text-sm text-gray-500">No regimes yet.</p>
          <p className="text-xs text-gray-600 mt-1">A regime sequences your routines into a rotating plan — e.g. a 4-day split that repeats.</p>
        </div>
      )}

      {regimes.map(regime => {
        const isActive = user.active_regime_id === regime.id;
        return (
          <div key={regime.id} className={`bg-gray-900 rounded-2xl border p-4 space-y-3 ${isActive ? 'border-indigo-700' : 'border-gray-800'}`}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-white truncate">{regime.name}</p>
                  {isActive && (
                    <span className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-900/60 text-indigo-300 border border-indigo-800/50 shrink-0">
                      <Star size={9} fill="currentColor" /> Active
                    </span>
                  )}
                </div>
                {regime.notes && <p className="text-[11px] text-gray-500 mt-0.5">{regime.notes}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setEditing(regime)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-white">
                  <Pencil size={13} />
                </button>
                <button onClick={() => setConfirmDeleteId(regime.id)} className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-500 hover:text-red-400">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>

            <div className="space-y-1">
              {regime.days.map((day, i) => (
                <div key={day.id} className={`flex items-center gap-2 text-xs rounded-lg px-2.5 py-1.5 ${
                  isActive && regime.next_day_index === i ? 'bg-indigo-950/50 text-indigo-300 border border-indigo-800/40' : 'bg-gray-800/50 text-gray-400'
                }`}>
                  <span className="font-mono text-[10px] text-gray-600 w-3">{i + 1}</span>
                  <span className="flex-1 truncate">{day.routine_name}</span>
                  {isActive && regime.next_day_index === i && <span className="text-[10px] shrink-0">Up next</span>}
                </div>
              ))}
            </div>

            {confirmDeleteId === regime.id ? (
              <div className="flex items-center gap-2 pt-1">
                <span className="text-[11px] text-gray-400">Delete this regime?</span>
                <button onClick={() => deleteRegime.mutate(regime.id)} className="text-[11px] px-2 py-0.5 rounded bg-red-900/50 text-red-400 hover:bg-red-900">Yes</button>
                <button onClick={() => setConfirmDeleteId(null)} className="text-[11px] px-2 py-0.5 rounded bg-gray-800 text-gray-400 hover:text-white">No</button>
              </div>
            ) : !isActive && (
              <button onClick={() => onSetActive(regime.id)} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                <Star size={11} /> Set as active
              </button>
            )}
          </div>
        );
      })}

      {editing && (
        <RegimeEditorModal
          regime={editing === 'new' ? null : editing}
          routines={routines}
          onClose={() => setEditing(null)}
          onSave={(data) => {
            if (!data.routine_ids.length) { toast('Add at least one day to the regime.', 'error'); return; }
            saveRegime.mutate(editing === 'new' ? data : { ...data, id: editing.id });
          }}
          saving={saveRegime.isPending}
        />
      )}
    </div>
  );
}

function RegimeEditorModal({ regime, routines, onClose, onSave, saving }: {
  regime: WorkoutRegime | null;
  routines: Routine[];
  onClose: () => void;
  onSave: (data: { name: string; notes?: string; routine_ids: number[] }) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(regime?.name ?? '');
  const [notes, setNotes] = useState(regime?.notes ?? '');
  const [dayRoutineIds, setDayRoutineIds] = useState<number[]>(
    regime?.days.map(d => d.routine_id) ?? (routines[0] ? [routines[0].id] : [])
  );

  function addDay() {
    setDayRoutineIds(ids => [...ids, routines[0]?.id].filter((x): x is number => x != null));
  }
  function removeDay(i: number) {
    setDayRoutineIds(ids => ids.filter((_, idx) => idx !== i));
  }
  function setDay(i: number, routineId: number) {
    setDayRoutineIds(ids => ids.map((id, idx) => (idx === i ? routineId : id)));
  }

  return (
    <Modal open onClose={onClose} title={regime ? 'Edit Regime' : 'New Regime'} size="md">
      <div className="space-y-3">
        <Input label="Regime name *" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. General Recomposition" />
        <Input label="Notes (optional)" value={notes} onChange={e => setNotes(e.target.value)} placeholder="What this regime is optimized for" />

        <div className="space-y-2">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Days (repeats in order)</p>
          {routines.length === 0 ? (
            <p className="text-xs text-gray-500 italic">No routines yet — create one in Library → Routines first.</p>
          ) : (
            <div className="space-y-1.5">
              {dayRoutineIds.map((routineId, i) => (
                <div key={i} className="flex items-center gap-2">
                  <GripVertical size={14} className="text-gray-700 shrink-0" />
                  <span className="text-[11px] text-gray-500 w-10 shrink-0">Day {i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <Select
                      value={String(routineId)}
                      onChange={e => setDay(i, Number(e.target.value))}
                      options={routines.map(r => ({ value: String(r.id), label: r.name }))}
                    />
                  </div>
                  <button onClick={() => removeDay(i)} className="p-1 text-gray-600 hover:text-red-400 shrink-0">
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button onClick={addDay} disabled={routines.length === 0} className="w-full flex items-center justify-center gap-1.5 text-xs text-indigo-400 hover:text-indigo-300 py-1.5 border border-dashed border-gray-700 rounded-xl disabled:opacity-40">
            <Plus size={12} /> Add Day
          </button>
          <p className="text-[10px] text-gray-600">A routine can repeat across multiple days.</p>
        </div>

        <div className="flex gap-2 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button onClick={() => onSave({ name, notes: notes || undefined, routine_ids: dayRoutineIds })} disabled={!name || saving} className="flex-1">
            {saving ? 'Saving…' : 'Save Regime'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
