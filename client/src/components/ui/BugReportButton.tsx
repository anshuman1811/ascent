import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Bug, X, Send, ChevronDown } from 'lucide-react';
import { useLocation } from 'react-router-dom';
import { api } from '../../api/client';
import { useAppStore } from '../../store/appStore';
import Button from './Button';

const TYPES = [
  { value: 'bug', label: 'Bug' },
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'other', label: 'Other' },
];

export default function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'bug' | 'suggestion' | 'other'>('bug');
  const [submitted, setSubmitted] = useState(false);
  const { activeUserId } = useAppStore();
  const location = useLocation();
  const qc = useQueryClient();

  const submit = useMutation({
    mutationFn: () => api.post('/bug-reports', {
      user_id: activeUserId,
      description,
      type,
      page_url: location.pathname,
      page_title: document.title,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bug-reports'] });
      setSubmitted(true);
      setDescription('');
      setTimeout(() => {
        setOpen(false);
        setSubmitted(false);
        setType('bug');
      }, 1800);
    },
  });

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 right-4 z-50 lg:bottom-6 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-800 border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 text-xs font-medium transition-colors shadow-lg"
        title="Report a bug or suggestion"
      >
        <Bug size={13} />
        Feedback
      </button>

      {/* Popup */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60" onClick={() => !submit.isPending && setOpen(false)} />

          <div className="relative w-full max-w-sm bg-gray-900 border border-gray-700 rounded-2xl shadow-2xl p-5 space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bug size={16} className="text-indigo-400" />
                <h3 className="text-sm font-semibold text-white">Report Feedback</h3>
              </div>
              <button
                onClick={() => !submit.isPending && setOpen(false)}
                className="p-1 text-gray-500 hover:text-white transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {submitted ? (
              <div className="text-center py-4">
                <p className="text-green-400 font-medium text-sm">Thanks! Logged successfully.</p>
              </div>
            ) : (
              <>
                {/* Type selector */}
                <div className="flex gap-2">
                  {TYPES.map(t => (
                    <button
                      key={t.value}
                      onClick={() => setType(t.value as typeof type)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-colors border ${
                        type === t.value
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-gray-800 border-gray-700 text-gray-400 hover:text-white'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Page context */}
                <p className="text-[11px] text-gray-600">
                  Page: <span className="text-gray-500">{location.pathname}</span>
                </p>

                {/* Description */}
                <textarea
                  autoFocus
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  placeholder={type === 'bug' ? 'Describe what went wrong…' : 'What would you like to see?'}
                  rows={4}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-gray-600 focus:border-indigo-500 outline-none resize-none"
                />

                <Button
                  onClick={() => submit.mutate()}
                  disabled={!description.trim() || submit.isPending}
                  className="w-full"
                  size="sm"
                >
                  <Send size={13} />
                  {submit.isPending ? 'Sending…' : 'Submit'}
                </Button>

                {submit.isError && (
                  <p className="text-xs text-red-400 text-center">Failed to submit — try again.</p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
