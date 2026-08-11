import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User } from '../types';

interface AppState {
  activeUserId: number;
  users: User[];
  setActiveUserId: (id: number) => void;
  setUsers: (users: User[]) => void;
  activeUser: () => User | undefined;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      activeUserId: 1,
      users: [],
      setActiveUserId: (id) => set({ activeUserId: id }),
      setUsers: (users) => set({ users }),
      activeUser: () => get().users.find(u => u.id === get().activeUserId),
    }),
    { name: 'fitness-app', partialize: (s) => ({ activeUserId: s.activeUserId }) }
  )
);

// Workout session timer store (not persisted — session state lives in DB).
// Keyed by sessionId so two LiveWorkout panes (pair split-screen) can run
// independent rest timers in the same browser tab without colliding.
interface SessionTimer {
  userId: number | null;
  restSecondsLeft: number;
  restTargetSeconds: number;
  restOvertime: number;
  restRunning: boolean;
  elapsedSeconds: number;
  sessionStartTs: number | null;
}

const DEFAULT_TIMER: SessionTimer = {
  userId: null, restSecondsLeft: 0, restTargetSeconds: 0, restOvertime: 0,
  restRunning: false, elapsedSeconds: 0, sessionStartTs: null,
};

interface WorkoutTimerState {
  sessions: Record<number, SessionTimer>;
  getSession: (sessionId: number) => SessionTimer;
  setSession: (sessionId: number, userId: number) => void;
  clearSession: (sessionId: number) => void;
  startRest: (sessionId: number, seconds: number) => void;
  tickRest: (sessionId: number) => void;
  stopRest: (sessionId: number) => void;
  tickElapsed: (sessionId: number) => void;
}

export const useWorkoutStore = create<WorkoutTimerState>((set, get) => ({
  sessions: {},
  getSession: (sessionId) => get().sessions[sessionId] ?? DEFAULT_TIMER,
  setSession: (sessionId, userId) => set(s => ({
    sessions: { ...s.sessions, [sessionId]: { ...DEFAULT_TIMER, userId, sessionStartTs: Date.now() } },
  })),
  clearSession: (sessionId) => set(s => {
    const next = { ...s.sessions };
    delete next[sessionId];
    return { sessions: next };
  }),
  startRest: (sessionId, seconds) => set(s => ({
    sessions: {
      ...s.sessions,
      [sessionId]: { ...(s.sessions[sessionId] ?? DEFAULT_TIMER), restSecondsLeft: seconds, restTargetSeconds: seconds, restRunning: true, restOvertime: 0 },
    },
  })),
  tickRest: (sessionId) => set(s => {
    const cur = s.sessions[sessionId];
    if (!cur) return s;
    const next = cur.restSecondsLeft <= 0
      ? { ...cur, restOvertime: cur.restOvertime + 1 }
      : { ...cur, restSecondsLeft: cur.restSecondsLeft - 1 };
    return { sessions: { ...s.sessions, [sessionId]: next } };
  }),
  stopRest: (sessionId) => set(s => ({
    sessions: {
      ...s.sessions,
      [sessionId]: { ...(s.sessions[sessionId] ?? DEFAULT_TIMER), restRunning: false, restSecondsLeft: 0, restTargetSeconds: 0, restOvertime: 0 },
    },
  })),
  tickElapsed: (sessionId) => set(s => {
    const cur = s.sessions[sessionId];
    if (!cur) return s;
    return { sessions: { ...s.sessions, [sessionId]: { ...cur, elapsedSeconds: cur.elapsedSeconds + 1 } } };
  }),
}));
