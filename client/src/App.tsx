import { BrowserRouter, Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from './api/client';
import { useAppStore } from './store/appStore';
import type { User } from './types';
import { ToastProvider } from './components/ui/Toast';
import Layout from './components/layout/Layout';
import Dashboard from './pages/Dashboard';
import FoodLog from './pages/FoodLog';
import LibraryLayout from './pages/Library/LibraryLayout';
import FoodLibrary from './pages/Library/FoodLibrary';
import ExerciseLibrary from './pages/Library/ExerciseLibrary';
import RoutineBuilder from './pages/Library/RoutineBuilder';
import WorkoutPage from './pages/Workout/WorkoutPage';
import LiveWorkout from './pages/Workout/LiveWorkout';
import Progress from './pages/Progress';
import Profile from './pages/Profile';
import Settings from './pages/Settings';
import BugTracker from './pages/BugTracker';

function AppRoutes({ userId }: { userId?: number }) {
  return (
    <Routes>
      <Route path="/" element={<Layout userId={userId} />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard userId={userId} />} />
        <Route path="food-log" element={<FoodLog userId={userId} />} />
        <Route path="library" element={<LibraryLayout />}>
          <Route index element={<Navigate to="/library/foods" replace />} />
          <Route path="foods" element={<FoodLibrary />} />
          <Route path="exercises" element={<ExerciseLibrary />} />
          <Route path="routines" element={<RoutineBuilder userId={userId} />} />
        </Route>
        <Route path="workout" element={<WorkoutPage userId={userId} />} />
        <Route path="workout/live/:sessionId" element={<LiveWorkout userId={userId} />} />
        <Route path="progress" element={<Progress userId={userId} />} />
        <Route path="profile" element={<Profile userId={userId} />} />
        <Route path="settings" element={<Settings />} />
        <Route path="bug-tracker" element={<BugTracker />} />
      </Route>
    </Routes>
  );
}

function AppInner() {
  const { setUsers } = useAppStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const splitParam = searchParams.get('users');
  const splitUserIds = splitParam ? splitParam.split(',').map(Number).filter(Boolean) : null;
  const isSplit = splitUserIds && splitUserIds.length === 2;

  const liveSessionsParam = searchParams.get('liveSessions');
  const liveUsersParam = searchParams.get('liveUsers');
  const liveSessionIds = liveSessionsParam ? liveSessionsParam.split(',').map(Number).filter(Boolean) : null;
  const liveUserIds = liveUsersParam ? liveUsersParam.split(',').map(Number).filter(Boolean) : null;
  const isLivePair = !!liveSessionIds && liveSessionIds.length === 2 && !!liveUserIds && liveUserIds.length === 2;

  const { data: users } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
  });

  useEffect(() => {
    if (users) setUsers(users);
  }, [users, setUsers]);

  if (isLivePair) {
    const exitPair = () => navigate('/dashboard');
    return (
      <div className="force-landscape">
        <div className="flex flex-row h-full w-full overflow-hidden bg-gray-950">
          <div className="flex-1 border-r border-gray-800 overflow-auto min-h-0">
            <LiveWorkout sessionIdOverride={liveSessionIds![0]} userId={liveUserIds![0]} onExit={exitPair} />
          </div>
          <div className="flex-1 overflow-auto min-h-0">
            <LiveWorkout sessionIdOverride={liveSessionIds![1]} userId={liveUserIds![1]} onExit={exitPair} />
          </div>
        </div>
      </div>
    );
  }

  if (isSplit) {
    return (
      // Portrait: stack vertically; Landscape/wide: side by side
      <div className="flex portrait:flex-col landscape:flex-row sm:flex-row h-screen overflow-hidden bg-gray-950">
        <div className="flex-1 portrait:border-b landscape:border-r sm:border-r border-gray-800 overflow-auto min-h-0">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <Dashboard userId={splitUserIds[0]} hidePeer />
          </div>
        </div>
        <div className="flex-1 overflow-auto min-h-0">
          <div className="max-w-2xl mx-auto px-4 py-4">
            <Dashboard userId={splitUserIds[1]} hidePeer />
          </div>
        </div>
      </div>
    );
  }

  return <AppRoutes />;
}

export default function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AppInner />
      </ToastProvider>
    </BrowserRouter>
  );
}
