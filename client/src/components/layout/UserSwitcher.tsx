import type { User } from '../../types';

interface Props {
  users: User[];
  activeId: number;
  onChange: (id: number) => void;
  compact?: boolean;
}

export default function UserSwitcher({ users, activeId, onChange, compact }: Props) {
  if (users.length === 0) return null;

  return (
    <div className={`flex gap-1 mt-2 ${compact ? 'ml-auto' : ''}`}>
      {users.map(u => (
        <button
          key={u.id}
          onClick={() => onChange(u.id)}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
            u.id === activeId
              ? 'text-white shadow-sm'
              : 'text-gray-400 hover:text-white bg-transparent'
          }`}
          style={u.id === activeId ? { background: u.avatar_color } : {}}
        >
          {compact ? u.name.split(' ')[0] : u.name}
        </button>
      ))}
    </div>
  );
}
