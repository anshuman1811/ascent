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

// Workout session timer store (not persisted — session state lives in DB)
interface WorkoutTimerState {
  sessionId: number | null;
  userId: number | null;
  restSecondsLeft: number;
  restRunning: boolean;
  elapsedSeconds: number;
  sessionStartTs: number | null;
  setSession: (sessionId: number, userId: number) => void;
  clearSession: () => void;
  startRest: (seconds: number) => void;
  tickRest: () => void;
  stopRest: () => void;
  tickElapsed: () => void;
}

export const useWorkoutStore = create<WorkoutTimerState>((set, get) => ({
  sessionId: null,
  userId: null,
  restSecondsLeft: 0,
  restRunning: false,
  elapsedSeconds: 0,
  sessionStartTs: null,
  setSession: (sessionId, userId) => set({ sessionId, userId, sessionStartTs: Date.now(), elapsedSeconds: 0 }),
  clearSession: () => set({ sessionId: null, userId: null, restRunning: false, restSecondsLeft: 0, elapsedSeconds: 0, sessionStartTs: null }),
  startRest: (seconds) => set({ restSecondsLeft: seconds, restRunning: true }),
  tickRest: () => {
    const { restSecondsLeft } = get();
    if (restSecondsLeft <= 1) set({ restSecondsLeft: 0, restRunning: false });
    else set({ restSecondsLeft: restSecondsLeft - 1 });
  },
  stopRest: () => set({ restRunning: false, restSecondsLeft: 0 }),
  tickElapsed: () => set(s => ({ elapsedSeconds: s.elapsedSeconds + 1 })),
}));
