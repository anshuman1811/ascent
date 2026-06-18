import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Play, Clock, Dumbbell, Plus, Trophy, History, Flame, Activity, Trash2, ChevronDown, ChevronUp, BarChart2, Timer } from 'lucide-react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import { useWorkoutStore } from '../../store/appStore';
import type { Routine, WorkoutSession } from '../../types';
import { formatDuration, parseSQLiteLocal } from '../../utils/units';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';

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
  { key: 'start',   icon: Play,    label: 'Start'   },
  { key: 'history', icon: History, label: 'History' },
  { key: 'pbs',     icon: Trophy,  label: 'PRs'     },
] as const;
type Tab = typeof TABS[number]['key'];

export default function WorkoutPage({ userId: propUserId }: { userId?: number }) {
  const ctx = useOutletContext<OutletCtx | null>();
  const { activeUserId } = useAppStore();
  const userId = propUserId ?? ctx?.userId ?? activeUserId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { setSession } = useWorkoutStore();
  const [tab, setTab] = useState<Tab>('start');
  const [logActivityOpen, setLogActivityOpen] = useState(false);
  const [confirmDeleteSessionId, setConfirmDeleteSessionId] = useState<number | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<number | null>(null);

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

  const completedSessions = history.filter(s => {
    if (s.status === 'in_progress') return false;
    if (s.status === 'abandoned') {
      if (!s.completed_at) return false;
      const dur = Math.round((parseSQLiteLocal(s.completed_at).getTime() - parseSQLiteLocal(s.started_at).getTime()) / 1000);
      return dur >= 60;
    }
    return true;
  });

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
              {routines.map(r => (
                <div key={r.id} className="bg-gray-900 rounded-xl border border-gray-800 p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{r.name}</p>
                    {r.notes && <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>}
                    <p className="text-xs text-gray-600 mt-0.5">{r.exercises.length} exercise{r.exercises.length !== 1 ? 's' : ''}</p>
                  </div>
                  <Button size="sm" onClick={() => startSession.mutate(r.id)}>
                    <Play size={12} /> Start
                  </Button>
                </div>
              ))}
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
                    ) : detail.exercises && detail.exercises.length > 0 ? (
                      <div className="divide-y divide-gray-800/50">
                        {detail.exercises.map(ex => (
                          <div key={ex.id} className="px-4 py-3">
                            <div className="flex items-center gap-2 mb-2">
                              {ex.exercise_type === 'timed'
                                ? <Timer size={11} className="text-purple-400 shrink-0" />
                                : <BarChart2 size={11} className="text-blue-400 shrink-0" />}
                              <p className="text-xs font-medium text-white">{ex.exercise_name}</p>
                              <span className="text-[10px] text-gray-600 ml-auto">{ex.sets?.length ?? 0} sets</span>
                            </div>
                            {ex.sets && ex.sets.length > 0 ? (
                              <div className="space-y-1">
                                {ex.sets.map((set: any) => (
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
                                    {set.actual_rest_seconds != null && (
                                      <span className="text-indigo-400/60 ml-auto">{set.actual_rest_seconds}s rest</span>
                                    )}
                                    {set.notes && <span className="text-gray-600 italic">{set.notes}</span>}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-[11px] text-gray-600">No sets logged.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
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
                  {pb.rep_count != null && pb.weight_value != null && (
                    <p className="text-sm font-semibold text-yellow-400">
                      {pb.rep_count} × {pb.weight_value} {pb.weight_unit}
                    </p>
                  )}
                  {pb.duration_seconds != null && (
                    <p className="text-sm font-semibold text-yellow-400">
                      {formatDuration(pb.duration_seconds)}
                    </p>
                  )}
                  {pb.rep_count != null && (
                    <p className="text-xs text-gray-500">{pb.rep_count} reps</p>
                  )}
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
