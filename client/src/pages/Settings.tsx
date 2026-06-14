import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ExternalLink, Database, Users, Monitor } from 'lucide-react';
import { api } from '../api/client';
import type { User } from '../types';

export default function Settings() {
  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: () => api.get<User[]>('/users'),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-white">Settings</h1>

      {/* Per-user settings */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Users size={12} /> Per-User Settings
        </p>
        {users.map(u => (
          <Link key={u.id} to="/profile"
            className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-gray-800 transition-colors">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                style={{ background: u.avatar_color }}>
                {u.name[0]}
              </span>
              <span className="text-sm text-white">{u.name}</span>
            </div>
            <span className="text-xs text-gray-500">
              {u.weight_unit} · {u.volume_unit} · {u.length_unit}
            </span>
          </Link>
        ))}
        <p className="text-xs text-gray-600 px-3">Units and targets are configured per-user in their Profile.</p>
      </div>

      {/* Split screen */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Monitor size={12} /> Split-Screen Mode
        </p>
        <p className="text-xs text-gray-500">
          Open both users side-by-side on an iPad or wide display. Bookmark the link below.
        </p>
        {users.length === 2 && (
          <a
            href={`/?users=${users[0].id},${users[1].id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
          >
            <ExternalLink size={14} />
            Open split-screen →
          </a>
        )}
      </div>

      {/* Data info */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
          <Database size={12} /> Data Storage
        </p>
        <p className="text-xs text-gray-500">
          All data is stored locally in a SQLite database at <code className="text-gray-300 bg-gray-800 px-1 py-0.5 rounded">data/fitness.db</code>.
          No cloud sync — fully private.
        </p>
      </div>

      <div className="text-center text-xs text-gray-700 pt-4">
        FitTrack · Local build · Running on {window.location.host}
      </div>
    </div>
  );
}
