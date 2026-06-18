import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, UtensilsCrossed, Dumbbell, BookOpen, User, Settings
} from 'lucide-react';

const LINKS = [
  { to: '/dashboard',       icon: LayoutDashboard,  label: 'Dashboard' },
  { to: '/food-log',        icon: UtensilsCrossed,  label: 'Food Log'  },
  { to: '/workout',         icon: Dumbbell,          label: 'Workout'   },
  { to: '/library/foods',   icon: BookOpen,          label: 'Library'   },
  { to: '/profile',         icon: User,              label: 'Profile'   },
];

interface Props {
  orientation: 'horizontal' | 'vertical';
  className?: string;
}

export default function Nav({ orientation, className = '' }: Props) {
  const location = useLocation();
  const isLibraryActive = location.pathname.startsWith('/library');

  const isActive = (label: string, to: string) =>
    label === 'Library' ? isLibraryActive : location.pathname.startsWith(to);

  if (orientation === 'horizontal') {
    return (
      <>
        {/* Portrait phone: tall bottom tab bar */}
        <nav className={`portrait:flex landscape:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 safe-bottom z-40 lg:hidden ${className}`}>
          <div className="flex justify-around items-center h-16">
            {LINKS.map(({ to, icon: Icon, label }) => {
              const active = isActive(label, to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                    active ? 'text-indigo-400' : 'text-gray-500'
                  }`}
                >
                  <Icon size={20} strokeWidth={active ? 2.5 : 1.75} />
                  <span className="text-[10px] font-medium">{label}</span>
                </NavLink>
              );
            })}
          </div>
        </nav>

        {/* Landscape phone: compact left icon rail */}
        <nav className={`landscape:flex portrait:hidden fixed left-0 top-0 bottom-0 flex-col bg-gray-900 border-r border-gray-800 z-40 lg:hidden w-11 ${className}`}>
          <div className="flex flex-col items-center py-2 gap-1 h-full overflow-y-auto hide-scrollbar">
            {LINKS.map(({ to, icon: Icon, label }) => {
              const active = isActive(label, to);
              return (
                <NavLink
                  key={to}
                  to={to}
                  title={label}
                  className={`flex items-center justify-center w-9 h-9 rounded-lg transition-colors ${
                    active ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-white hover:bg-gray-800'
                  }`}
                >
                  <Icon size={17} strokeWidth={active ? 2.5 : 1.75} />
                </NavLink>
              );
            })}
            <NavLink
              to="/settings"
              title="Settings"
              className={({ isActive: a }) =>
                `flex items-center justify-center w-9 h-9 rounded-lg transition-colors mt-auto ${
                  a ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <Settings size={17} strokeWidth={1.75} />
            </NavLink>
          </div>
        </nav>
      </>
    );
  }

  // Vertical sidebar (desktop)
  return (
    <nav className="flex-1 py-4 flex flex-col gap-0.5 px-3">
      {LINKS.map(({ to, icon: Icon, label }) => {
        const active = isActive(label, to);
        return (
          <NavLink
            key={to}
            to={to}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              active ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            <Icon size={18} strokeWidth={active ? 2.5 : 1.75} />
            {label}
          </NavLink>
        );
      })}
      <NavLink
        to="/settings"
        className={({ isActive: a }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-auto ${
            a ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
          }`
        }
      >
        <Settings size={18} strokeWidth={1.75} />
        Settings
      </NavLink>
    </nav>
  );
}
