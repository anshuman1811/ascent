import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useOutletContext, useNavigate } from 'react-router-dom';
import { Play, Clock, Dumbbell, Plus, Trophy, History } from 'lucide-react';
import { api } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import { useWorkoutStore } from '../../store/appStore';
import type { Routine, WorkoutSession } from '../../types';
import { formatDuration } from '../../utils/units';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';

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
  const [startOpen, setStartOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('start');

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
                Started {new Date(active.started_at).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
              <Button onClick={() => navigate(`/workout/live/${active.id}`)} className="mt-3 w-full bg-indigo-600">
                <Play size={14} /> Resume Workout
              </Button>
            </div>
          )}

          {!active && (
            <div className="space-y-2">
              <Button onClick={() => setStartOpen(true)} className="w-full" size="lg">
                <Play size={16} /> Start from Routine
              </Button>
              <Button onClick={() => startSession.mutate(undefined)} variant="secondary" className="w-full">
                <Plus size={14} /> Quick Start (Ad-hoc)
              </Button>
            </div>
          )}

          {routines.length > 0 && (
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-400">Your Routines</h2>
              {routines.map(r => (
                <div key={r.id} className="bg-gray-900 rounded-xl border border-gray-800 p-3.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{r.name}</p>
                    {r.notes && <p className="text-xs text-gray-500 mt-0.5">{r.notes}</p>}
                  </div>
                  <Button size="sm" onClick={() => startSession.mutate(r.id)} disabled={!!active}>
                    <Play size={12} /> Start
                  </Button>
                </div>
              ))}
            </div>
          )}

          {routines.length === 0 && !active && (
            <p className="text-sm text-gray-500 text-center py-4">
              No routines yet.{' '}
              <button className="text-indigo-400 underline" onClick={() => navigate('/library/routines')}>
                Build one in Library
              </button>
            </p>
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
              ? Math.round((new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 1000)
              : 0;
            return (
              <div key={session.id} className="bg-gray-900 rounded-xl border border-gray-800 p-3.5">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-medium text-white">{session.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {new Date(session.started_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <div className="flex items-center gap-1"><Clock size={11} />{formatDuration(duration)}</div>
                    {session.calories_burned && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <Dumbbell size={11} />{Math.round(session.calories_burned)} kcal
                      </div>
                    )}
                  </div>
                </div>
                {session.status === 'abandoned' && (
                  <span className="mt-1.5 inline-block text-[10px] px-2 py-0.5 bg-red-900/30 text-red-400 rounded-full">abandoned</span>
                )}
              </div>
            );
          })}
        </div>
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
                    {new Date(pb.achieved_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
                <div className="text-right">
                  {pb.rep_count != null && pb.weight_value != null && (
                    <p className="text-sm font-semibold text-yellow-400">
                      {pb.rep_count} × {pb.weight_value}{pb.weight_unit}
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

      <StartWorkoutModal
        open={startOpen}
        routines={routines}
        onClose={() => setStartOpen(false)}
        onStart={(routineId) => startSession.mutate(routineId)}
        loading={startSession.isPending}
      />
    </div>
  );
}

function StartWorkoutModal({ open, routines, onClose, onStart, loading }: {
  open: boolean; routines: Routine[]; onClose: () => void;
  onStart: (routineId?: number) => void; loading: boolean;
}) {
  const [routineId, setRoutineId] = useState<number | ''>('');

  return (
    <Modal open={open} onClose={onClose} title="Start Workout" size="sm">
      <div className="space-y-4">
        <Select
          label="Select routine (optional)"
          value={routineId}
          onChange={e => setRoutineId(e.target.value ? Number(e.target.value) : '')}
          options={[
            { value: '', label: '— Ad-hoc (no routine) —' },
            ...routines.map(r => ({ value: r.id, label: r.name })),
          ]}
        />
        <Button onClick={() => onStart(routineId || undefined)} disabled={loading} className="w-full">
          {loading ? 'Starting…' : 'Start'}
        </Button>
      </div>
    </Modal>
  );
}
