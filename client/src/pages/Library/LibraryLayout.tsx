import { NavLink, Outlet } from 'react-router-dom';
import { Utensils, Dumbbell, ListChecks } from 'lucide-react';

const TABS = [
  { to: '/library/foods',     icon: Utensils,    label: 'Foods'    },
  { to: '/library/exercises', icon: Dumbbell,    label: 'Exercises' },
  { to: '/library/routines',  icon: ListChecks,  label: 'Routines' },
];

export default function LibraryLayout() {
  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1">
        {TABS.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-medium transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-500 hover:text-gray-300'
              }`
            }
          >
            <Icon size={13} />
            {label}
          </NavLink>
        ))}
      </div>
      <Outlet />
    </div>
  );
}
