import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bug, CheckCircle, Clock, AlertCircle, ChevronDown, Trash2, MessageSquare } from 'lucide-react';
import { api } from '../api/client';
import Button from '../components/ui/Button';

interface BugReport {
  id: number;
  user_id: number | null;
  reporter_name: string | null;
  description: string;
  type: 'bug' | 'suggestion' | 'other';
  page_url: string | null;
  page_title: string | null;
  status: 'open' | 'in_progress' | 'resolved';
  notes: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_META = {
  open:        { label: 'Open',        color: 'text-red-400',    bg: 'bg-red-950/40 border-red-800/50',    icon: AlertCircle },
  in_progress: { label: 'In Progress', color: 'text-amber-400',  bg: 'bg-amber-950/40 border-amber-800/50', icon: Clock },
  resolved:    { label: 'Resolved',    color: 'text-green-400',  bg: 'bg-green-950/40 border-green-800/50', icon: CheckCircle },
};

const TYPE_META = {
  bug:        { label: 'Bug',        color: 'bg-red-900/40 text-red-300' },
  suggestion: { label: 'Suggestion', color: 'bg-blue-900/40 text-blue-300' },
  other:      { label: 'Other',      color: 'bg-gray-800 text-gray-400' },
};

function formatDate(ts: string) {
  const d = new Date(ts.replace(' ', 'T') + 'Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function BugTracker() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'resolved'>('all');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState<{ id: number; text: string } | null>(null);

  const { data: reports = [] } = useQuery<BugReport[]>({
    queryKey: ['bug-reports'],
    queryFn: () => api.get('/bug-reports'),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/bug-reports/${id}`, { status }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bug-reports'] }),
  });

  const saveNotes = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes: string }) =>
      api.patch(`/bug-reports/${id}`, { notes }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bug-reports'] }); setEditingNotes(null); },
  });

  const deleteReport = useMutation({
    mutationFn: (id: number) => api.delete(`/bug-reports/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['bug-reports'] }),
  });

  const filtered = filter === 'all' ? reports : reports.filter(r => r.status === filter);
  const counts = {
    open: reports.filter(r => r.status === 'open').length,
    in_progress: reports.filter(r => r.status === 'in_progress').length,
    resolved: reports.filter(r => r.status === 'resolved').length,
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bug size={20} className="text-indigo-400" />
          <h1 className="text-xl font-bold text-white">Feedback Tracker</h1>
        </div>
        <span className="text-sm text-gray-500">{reports.length} total</span>
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 gap-3">
        {(['open', 'in_progress', 'resolved'] as const).map(s => {
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <button
              key={s}
              onClick={() => setFilter(f => f === s ? 'all' : s)}
              className={`p-3 rounded-xl border text-center transition-all ${
                filter === s ? meta.bg : 'bg-gray-900 border-gray-800 hover:border-gray-700'
              }`}
            >
              <Icon size={16} className={`mx-auto mb-1 ${meta.color}`} />
              <p className={`text-lg font-bold ${meta.color}`}>{counts[s]}</p>
              <p className="text-[10px] text-gray-500 uppercase tracking-wide">{meta.label}</p>
            </button>
          );
        })}
      </div>

      {/* Reports list */}
      {filtered.length === 0 ? (
        <div className="text-center py-12">
          <Bug size={32} className="text-gray-700 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {filter === 'all' ? 'No reports yet — use the Feedback button to report issues.' : `No ${filter.replace('_', ' ')} reports.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(report => {
            const statusMeta = STATUS_META[report.status];
            const typeMeta = TYPE_META[report.type];
            const StatusIcon = statusMeta.icon;
            const isExpanded = expandedId === report.id;

            return (
              <div key={report.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                {/* Summary row */}
                <button
                  className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-800/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : report.id)}
                >
                  <StatusIcon size={15} className={`${statusMeta.color} shrink-0 mt-0.5`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${typeMeta.color}`}>
                        {typeMeta.label}
                      </span>
                      {report.page_url && (
                        <span className="text-[10px] text-gray-600 truncate max-w-[120px]">{report.page_url}</span>
                      )}
                      <span className="text-[10px] text-gray-600 ml-auto">{formatDate(report.created_at)}</span>
                    </div>
                    <p className="text-sm text-white leading-snug line-clamp-2">{report.description}</p>
                    <p className="text-[11px] text-gray-600 mt-0.5">
                      {report.reporter_name ?? 'Unknown user'}
                    </p>
                  </div>
                  <ChevronDown
                    size={14}
                    className={`text-gray-600 shrink-0 mt-0.5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-800 p-4 space-y-3 bg-gray-900/50">
                    {/* Full description */}
                    <p className="text-sm text-gray-300 leading-relaxed">{report.description}</p>

                    {/* Status control */}
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 shrink-0">Status:</span>
                      <div className="flex gap-1.5 flex-wrap">
                        {(['open', 'in_progress', 'resolved'] as const).map(s => (
                          <button
                            key={s}
                            onClick={() => updateStatus.mutate({ id: report.id, status: s })}
                            disabled={updateStatus.isPending}
                            className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors border ${
                              report.status === s
                                ? `${STATUS_META[s].bg} ${STATUS_META[s].color}`
                                : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-white'
                            }`}
                          >
                            {STATUS_META[s].label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Notes */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          <MessageSquare size={11} /> Notes
                        </span>
                        {editingNotes?.id !== report.id && (
                          <button
                            onClick={() => setEditingNotes({ id: report.id, text: report.notes ?? '' })}
                            className="text-[11px] text-indigo-400 hover:text-indigo-300"
                          >
                            {report.notes ? 'Edit' : 'Add note'}
                          </button>
                        )}
                      </div>
                      {editingNotes?.id === report.id ? (
                        <div className="space-y-2">
                          <textarea
                            autoFocus
                            value={editingNotes.text}
                            onChange={e => setEditingNotes({ id: report.id, text: e.target.value })}
                            rows={3}
                            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-indigo-500 outline-none resize-none"
                            placeholder="Add investigation notes…"
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => setEditingNotes(null)}
                              className="flex-1"
                            >Cancel</Button>
                            <Button
                              size="sm"
                              onClick={() => saveNotes.mutate({ id: report.id, notes: editingNotes.text })}
                              disabled={saveNotes.isPending}
                              className="flex-1"
                            >Save</Button>
                          </div>
                        </div>
                      ) : report.notes ? (
                        <p className="text-sm text-gray-400 bg-gray-800 rounded-lg px-3 py-2">{report.notes}</p>
                      ) : (
                        <p className="text-xs text-gray-700 italic">No notes yet.</p>
                      )}
                    </div>

                    {/* Delete */}
                    <div className="flex justify-end pt-1">
                      <button
                        onClick={() => deleteReport.mutate(report.id)}
                        disabled={deleteReport.isPending}
                        className="flex items-center gap-1 text-xs text-gray-600 hover:text-red-400 transition-colors"
                      >
                        <Trash2 size={11} /> Delete
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
