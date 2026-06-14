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

  if (orientation === 'horizontal') {
    return (
      <nav className={`fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 safe-bottom z-40 ${className}`}>
        <div className="flex justify-around items-center h-16">
          {LINKS.map(({ to, icon: Icon, label }) => {
            const isActive = label === 'Library' ? isLibraryActive : location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg transition-colors ${
                  isActive ? 'text-indigo-400' : 'text-gray-500'
                }`}
              >
                <Icon size={20} strokeWidth={isActive ? 2.5 : 1.75} />
                <span className="text-[10px] font-medium">{label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    );
  }

  return (
    <nav className="flex-1 py-4 flex flex-col gap-0.5 px-3">
      {LINKS.map(({ to, icon: Icon, label }) => {
        const isActive = label === 'Library' ? isLibraryActive : location.pathname.startsWith(to);
        return (
          <NavLink
            key={to}
            to={to}
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
            }`}
          >
            <Icon size={18} strokeWidth={isActive ? 2.5 : 1.75} />
            {label}
          </NavLink>
        );
      })}
      <NavLink
        to="/settings"
        className={({ isActive }) =>
          `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors mt-auto ${
            isActive ? 'bg-gray-800 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800/50'
          }`
        }
      >
        <Settings size={18} strokeWidth={1.75} />
        Settings
      </NavLink>
    </nav>
  );
}
