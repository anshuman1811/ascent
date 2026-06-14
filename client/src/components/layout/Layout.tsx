import { Outlet, NavLink } from 'react-router-dom';
import { Settings } from 'lucide-react';
import Nav from './Nav';
import UserSwitcher from './UserSwitcher';
import { useAppStore } from '../../store/appStore';

interface Props { userId?: number; }

export default function Layout({ userId }: Props) {
  const { activeUserId, setActiveUserId, users } = useAppStore();
  const effectiveUserId = userId ?? activeUserId;
  const user = users.find(u => u.id === effectiveUserId);

  return (
    <div className="flex flex-col h-screen bg-gray-950 md:flex-row">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex md:flex-col md:w-56 md:shrink-0 bg-gray-900 border-r border-gray-800">
        <div className="p-4 border-b border-gray-800">
          <h1 className="text-lg font-bold tracking-tight text-white">FitTrack</h1>
          {!userId && <UserSwitcher users={users} activeId={activeUserId} onChange={setActiveUserId} />}
          {user && (
            <div className="mt-2 flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: user.avatar_color }} />
              <span className="text-sm font-medium text-white">{user.name}</span>
            </div>
          )}
        </div>
        <Nav orientation="vertical" />
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto pb-20 md:pb-0">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 sticky top-0 z-30">
          <h1 className="text-base font-bold tracking-tight">FitTrack</h1>
          <div className="flex items-center gap-2">
            {!userId && <UserSwitcher users={users} activeId={activeUserId} onChange={setActiveUserId} compact />}
            {user && (
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full" style={{ background: user.avatar_color }} />
                <span className="text-sm font-medium">{user.name}</span>
              </div>
            )}
            <NavLink to="/settings" className={({ isActive }) =>
              `p-1.5 rounded-lg transition-colors ${isActive ? 'text-white bg-gray-800' : 'text-gray-500 hover:text-white'}`
            }>
              <Settings size={18} strokeWidth={1.75} />
            </NavLink>
          </div>
        </header>
        <div className="max-w-3xl mx-auto px-4 py-4 md:px-6 md:py-6">
          <Outlet context={{ userId: effectiveUserId }} />
        </div>
      </main>

      {/* Bottom nav — mobile */}
      <Nav orientation="horizontal" className="md:hidden" />
    </div>
  );
}
