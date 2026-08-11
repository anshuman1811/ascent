import { useState, useMemo, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useOutletContext } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, Sparkles, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { api } from '../api/client';
import MuscleMap from '../components/ui/MuscleMap';

interface OutletCtx { userId: number; }

// ── Types ─────────────────────────────────────────────────────────────────────

interface StrengthPoint {
  date: string;
  e1rm: number;
  weight: number;
  weight_unit: string;
  reps: number;
  is_pb: boolean;
}

interface ExerciseStrength {
  exercise_id: number;
  exercise_name: string;
  primary_muscles: string[];
  history: StrengthPoint[];
}

interface ProgressData {
  muscleWeeklyVolume: Record<string, number[]>;
  exerciseStrength: ExerciseStrength[];
  movementPattern: Record<string, number>;
  weekStarts: string[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MUSCLE_LABELS: Record<string, string> = {
  chest: 'Chest', shoulders: 'Shoulders', biceps: 'Biceps', triceps: 'Triceps',
  upper_back: 'Upper Back', lats: 'Lats', lower_back: 'Lower Back', core: 'Core',
  quads: 'Quads', hamstrings: 'Hamstrings', glutes: 'Glutes', calves: 'Calves',
};

const MUSCLE_COLORS: Record<string, string> = {
  chest: '#f97316', shoulders: '#fb923c', biceps: '#38bdf8', triceps: '#22d3ee',
  upper_back: '#818cf8', lats: '#6366f1', lower_back: '#a78bfa', core: '#c084fc',
  quads: '#34d399', hamstrings: '#10b981', glutes: '#059669', calves: '#6ee7b7',
};

const MOVEMENT_COLORS: Record<string, string> = {
  push: '#f97316', pull: '#6366f1', hinge: '#34d399', squat: '#fbbf24', core: '#38bdf8',
};
const MOVEMENT_LABELS: Record<string, string> = {
  push: 'Push', pull: 'Pull', hinge: 'Hinge', squat: 'Squat', core: 'Core',
};

// ── Sub-components ────────────────────────────────────────────────────────────

function Sparkline({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const w = 84, h = 22;
  const n = values.length;
  const barW = (w / n) * 0.6;
  const slot = w / n;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
      {values.map((v, i) => {
        const barH = Math.max(v > 0 ? 2 : 0, (v / max) * h);
        return (
          <rect
            key={i}
            x={i * slot + (slot - barW) / 2}
            y={h - barH}
            width={barW}
            height={barH}
            fill={v > 0 ? color : '#1e293b'}
            rx="1"
            opacity={i === n - 1 ? 1 : 0.65 + (i / n) * 0.35}
          />
        );
      })}
    </svg>
  );
}

function LineChart({ data, color = '#6366f1' }: { data: StrengthPoint[]; color?: string }) {
  if (data.length < 2) return null;
  const w = 160, h = 52;
  const vals = data.map(d => d.e1rm);
  const minV = Math.min(...vals);
  const maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const pad = 4;

  const xs = data.map((_, i) => pad + (i / (data.length - 1)) * (w - pad * 2));
  const ys = data.map(d => (h - pad) - ((d.e1rm - minV) / range) * (h - pad * 2));

  const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L ${xs[xs.length - 1].toFixed(1)} ${h} L ${xs[0].toFixed(1)} ${h} Z`;

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full">
      <defs>
        <linearGradient id={`ag-${color.slice(1)}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#ag-${color.slice(1)})`} />
      <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
      {data.map((d, i) => (
        <circle
          key={i}
          cx={xs[i]}
          cy={ys[i]}
          r={d.is_pb ? 3.5 : i === data.length - 1 ? 3 : 2}
          fill={d.is_pb ? '#f59e0b' : color}
          stroke={d.is_pb ? '#fef3c7' : 'transparent'}
          strokeWidth="1"
        />
      ))}
    </svg>
  );
}

function DonutChart({ data }: { data: Record<string, number> }) {
  const total = Object.values(data).reduce((a, b) => a + b, 0);
  if (total === 0) return <p className="text-sm text-gray-500">No data yet</p>;

  const cx = 54, cy = 54, r = 42, inner = 26;
  let angle = -Math.PI / 2;

  const segments = Object.entries(data)
    .filter(([, v]) => v > 0)
    .map(([key, v]) => {
      const sweep = (v / total) * 2 * Math.PI;
      const a0 = angle;
      angle += sweep;
      return { key, v, a0, a1: angle };
    });

  function arc(a0: number, a1: number) {
    const gap = 0.02;
    const sa = a0 + gap, ea = a1 - gap;
    const x1 = cx + r * Math.cos(sa), y1 = cy + r * Math.sin(sa);
    const x2 = cx + r * Math.cos(ea), y2 = cy + r * Math.sin(ea);
    const x3 = cx + inner * Math.cos(ea), y3 = cy + inner * Math.sin(ea);
    const x4 = cx + inner * Math.cos(sa), y4 = cy + inner * Math.sin(sa);
    const large = ea - sa > Math.PI ? 1 : 0;
    return `M${x1} ${y1} A${r} ${r} 0 ${large} 1 ${x2} ${y2} L${x3} ${y3} A${inner} ${inner} 0 ${large} 0 ${x4} ${y4}Z`;
  }

  return (
    <div className="flex items-center gap-5">
      <svg width="108" height="108" viewBox="0 0 108 108" className="shrink-0">
        {segments.map(({ key, a0, a1 }) => (
          <path key={key} d={arc(a0, a1)} fill={MOVEMENT_COLORS[key] ?? '#6b7280'} />
        ))}
      </svg>
      <div className="flex flex-col gap-1.5 min-w-0">
        {segments.map(({ key, v }) => (
          <div key={key} className="flex items-center gap-2 text-xs">
            <div className="w-2 h-2 rounded-sm shrink-0" style={{ background: MOVEMENT_COLORS[key] }} />
            <span className="text-gray-400 w-12">{MOVEMENT_LABELS[key]}</span>
            <div className="flex-1 bg-white/5 rounded-full h-1 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${(v / total) * 100}%`, background: MOVEMENT_COLORS[key] }}
              />
            </div>
            <span className="text-gray-300 w-7 text-right">{Math.round((v / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Simple markdown renderer ─────────────────────────────────────────────────

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>
  );
}

function MarkdownBlock({ text }: { text: string }) {
  const lines = text.split('\n');
  const nodes: React.ReactNode[] = [];
  let listItems: string[] = [];

  function flushList() {
    if (listItems.length === 0) return;
    nodes.push(
      <ul key={nodes.length} className="space-y-1 my-2 pl-1">
        {listItems.map((item, i) => (
          <li key={i} className="flex gap-2 text-sm text-gray-300 leading-relaxed">
            <span className="text-indigo-400 shrink-0 mt-0.5">•</span>
            <span>{renderInline(item)}</span>
          </li>
        ))}
      </ul>
    );
    listItems = [];
  }

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith('## ')) {
      flushList();
      nodes.push(
        <h2 key={nodes.length} className="text-sm font-bold text-white uppercase tracking-wide mt-4 mb-1.5 first:mt-0 flex items-center gap-1.5">
          <span className="w-1 h-3.5 rounded-full bg-indigo-500 inline-block shrink-0" />
          {line.slice(3)}
        </h2>
      );
    } else if (line.startsWith('### ')) {
      flushList();
      nodes.push(<h3 key={nodes.length} className="text-xs font-semibold text-indigo-300 mt-3 mb-1">{line.slice(4)}</h3>);
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      listItems.push(line.slice(2));
    } else if (line === '') {
      flushList();
    } else {
      flushList();
      nodes.push(<p key={nodes.length} className="text-sm text-gray-300 leading-relaxed my-1">{renderInline(line)}</p>);
    }
  }
  flushList();
  return <>{nodes}</>;
}

// ── Analysis Panel ────────────────────────────────────────────────────────────

function AnalysisPanel({ userId }: { userId: number }) {
  const [status, setStatus] = useState<'idle' | 'streaming' | 'done' | 'error'>('idle');
  const [text, setText] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async () => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setText('');
    setCollapsed(false);
    setStatus('streaming');

    try {
      const resp = await fetch('/api/ai/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId }),
        signal: ctrl.signal,
      });

      if (!resp.ok || !resp.body) {
        const err = await resp.json().catch(() => ({ error: 'Server error' }));
        throw new Error(err.error ?? 'Server error');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6);
          if (payload === '[DONE]') { setStatus('done'); return; }
          try {
            const { text: chunk, error } = JSON.parse(payload);
            if (error) throw new Error(error);
            if (chunk) setText(prev => prev + chunk);
          } catch {}
        }
      }
      setStatus('done');
    } catch (e: unknown) {
      if ((e as Error).name === 'AbortError') return;
      setText((e as Error).message ?? 'Unknown error');
      setStatus('error');
    }
  }, [userId]);

  if (status === 'idle') {
    return (
      <button
        onClick={run}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-dashed border-indigo-700/50 text-indigo-400 hover:bg-indigo-950/30 hover:border-indigo-600 transition-colors text-sm font-medium"
      >
        <Sparkles size={15} />
        Analyze my progress
      </button>
    );
  }

  return (
    <section className="bg-gray-900/60 border border-indigo-800/30 rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className={`${status === 'streaming' ? 'text-indigo-400 animate-pulse' : 'text-indigo-400'}`} />
          <span className="text-sm font-semibold text-white">AI Analysis</span>
          {status === 'streaming' && <span className="text-[11px] text-indigo-400/70">Analyzing…</span>}
        </div>
        <div className="flex items-center gap-1">
          {status === 'done' && (
            <button
              onClick={run}
              className="p-1.5 text-gray-600 hover:text-indigo-400 transition-colors"
              title="Re-run analysis"
            >
              <RefreshCw size={13} />
            </button>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="p-1.5 text-gray-600 hover:text-white transition-colors"
          >
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 py-3">
          {status === 'error' ? (
            <div className="space-y-2">
              <p className="text-sm text-red-400">{text || 'Analysis failed.'}</p>
              <button onClick={run} className="text-xs text-indigo-400 hover:text-indigo-300">Try again</button>
            </div>
          ) : (
            <div className="min-h-[60px]">
              <MarkdownBlock text={text} />
              {status === 'streaming' && (
                <span className="inline-block w-1.5 h-3.5 bg-indigo-400 rounded-sm animate-pulse ml-0.5 align-middle" />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function Progress({ userId: userIdProp }: { userId?: number }) {
  const outlet = useOutletContext<OutletCtx | null>();
  const userId = userIdProp ?? outlet?.userId;
  const [selectedEx, setSelectedEx] = useState<number | null>(null);

  const { data, isLoading } = useQuery<ProgressData>({
    queryKey: ['progress', userId],
    queryFn: () => api.get(`/workouts/progress/${userId}`),
    enabled: !!userId,
  });

  const primaryCounts = useMemo(() => {
    if (!data) return {};
    const counts: Record<string, number> = {};
    const WEEKS = data.weekStarts.length;
    const windowStart = Math.max(0, WEEKS - 4);
    for (const [muscle, vals] of Object.entries(data.muscleWeeklyVolume)) {
      const fourWeekTotal = vals.slice(windowStart).reduce((a, b) => a + b, 0);
      counts[muscle] = Math.min(3, Math.floor(fourWeekTotal / 6));
    }
    return counts;
  }, [data]);

  const activeMuscles = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.muscleWeeklyVolume)
      .filter(([, vals]) => vals.some(v => v > 0))
      .sort(([a], [b]) => {
        const aSum = data.muscleWeeklyVolume[a].reduce((s, v) => s + v, 0);
        const bSum = data.muscleWeeklyVolume[b].reduce((s, v) => s + v, 0);
        return bSum - aSum;
      });
  }, [data]);

  if (!userId) return null;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const activeEx = selectedEx ?? data.exerciseStrength[0]?.exercise_id ?? null;
  const exData = data.exerciseStrength.find(e => e.exercise_id === activeEx);
  const WEEKS = data.weekStarts.length;

  const totalSets = Object.values(data.muscleWeeklyVolume)
    .reduce((sum, vals) => sum + vals.slice(WEEKS - 4).reduce((a, b) => a + b, 0), 0);

  return (
    <div className="p-4 pb-24 max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-white">Progress</h1>
          <p className="text-xs text-gray-500 mt-0.5">Last 12 weeks · {totalSets} sets logged</p>
        </div>
      </div>

      {/* ── Muscle Volume ──────────────────────────────────────────────────── */}
      <section className="bg-gray-900/60 border border-white/5 rounded-2xl p-4 space-y-4">
        <h2 className="text-sm font-semibold text-white tracking-wide">Muscle Volume</h2>
        <p className="text-[11px] text-gray-500 -mt-2">Heatmap based on last 4 weeks of training</p>

        <div className="flex gap-4 items-start">
          <div className="w-36 shrink-0">
            <MuscleMap primaryCounts={primaryCounts} secondaryCounts={{}} />
          </div>
          <div className="flex-1 min-w-0 grid grid-cols-2 gap-1.5">
            {activeMuscles.slice(0, 8).map(([muscle, vals]) => {
              const weeklyAvg = vals.slice(WEEKS - 4).reduce((a, b) => a + b, 0) / 4;
              const thisWeek = vals[WEEKS - 1];
              const color = MUSCLE_COLORS[muscle] ?? '#6366f1';
              return (
                <div key={muscle} className="bg-white/3 rounded-xl p-2 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-gray-300 truncate">
                      {MUSCLE_LABELS[muscle] ?? muscle}
                    </span>
                    <span className="text-[10px] text-gray-500 shrink-0 ml-1">
                      {thisWeek > 0 ? `${thisWeek}` : '–'}
                    </span>
                  </div>
                  <Sparkline values={vals} color={color} />
                  <div className="text-[9px] text-gray-600">
                    {weeklyAvg.toFixed(1)} sets/wk avg
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 justify-center pt-1">
          {([
            { color: '#ef4444', label: 'High volume' },
            { color: '#f97316', label: 'Moderate' },
            { color: '#eab308', label: 'Light' },
            { color: '#293548', label: 'Untrained' },
          ] as const).map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <span className="text-[9px] text-gray-500">{label}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Strength Trends ────────────────────────────────────────────────── */}
      {data.exerciseStrength.length > 0 && (
        <section className="bg-gray-900/60 border border-white/5 rounded-2xl p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white tracking-wide">Strength Trends</h2>
            <p className="text-[11px] text-gray-500 mt-0.5">Estimated 1-rep max · ⭐ = personal record</p>
          </div>

          {/* Exercise selector pills */}
          <div className="flex flex-wrap gap-1.5">
            {data.exerciseStrength.map(ex => {
              const isActive = ex.exercise_id === activeEx;
              const color = MUSCLE_COLORS[ex.primary_muscles[0]] ?? '#6366f1';
              return (
                <button
                  key={ex.exercise_id}
                  onClick={() => setSelectedEx(ex.exercise_id)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all ${
                    isActive
                      ? 'text-white border'
                      : 'bg-white/5 text-gray-400 hover:text-white border border-transparent'
                  }`}
                  style={isActive ? { borderColor: color, background: `${color}20`, color } : {}}
                >
                  {ex.exercise_name}
                </button>
              );
            })}
          </div>

          {/* Selected exercise chart */}
          {exData && (
            <div className="bg-white/3 rounded-xl p-3 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-semibold text-white">{exData.exercise_name}</p>
                  <div className="flex gap-1 mt-0.5">
                    {exData.primary_muscles.slice(0, 3).map(m => (
                      <span
                        key={m}
                        className="text-[9px] px-1.5 py-0.5 rounded-full"
                        style={{
                          background: `${MUSCLE_COLORS[m] ?? '#6366f1'}20`,
                          color: MUSCLE_COLORS[m] ?? '#6366f1',
                        }}
                      >
                        {MUSCLE_LABELS[m] ?? m}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="text-right">
                  {(() => {
                    const last = exData.history[exData.history.length - 1]!;
                    const prev = exData.history[exData.history.length - 2];
                    const delta = prev ? last.e1rm - prev.e1rm : 0;
                    const pct = prev ? ((delta / prev.e1rm) * 100).toFixed(1) : null;
                    return (
                      <div>
                        <p className="text-sm font-bold text-white">
                          {last.e1rm.toFixed(0)} {last.weight_unit}
                        </p>
                        {pct !== null && (
                          <div className={`flex items-center justify-end gap-0.5 text-[10px] ${
                            delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-500'
                          }`}>
                            {delta > 0 ? <TrendingUp size={10} /> : delta < 0 ? <TrendingDown size={10} /> : <Minus size={10} />}
                            {delta > 0 ? '+' : ''}{pct}%
                          </div>
                        )}
                        <p className="text-[9px] text-gray-500">e1RM</p>
                      </div>
                    );
                  })()}
                </div>
              </div>
              <LineChart data={exData.history} color={MUSCLE_COLORS[exData.primary_muscles[0]] ?? '#6366f1'} />
              <div className="flex justify-between text-[9px] text-gray-600 px-0.5">
                <span>{exData.history[0].date.slice(5)}</span>
                <span className="flex items-center gap-1">
                  <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-400" />
                  PR
                </span>
                <span>{exData.history[exData.history.length - 1]!.date.slice(5)}</span>
              </div>
            </div>
          )}

          {/* Mini summary grid for remaining exercises */}
          <div className="grid grid-cols-2 gap-1.5 pt-1">
            {data.exerciseStrength
              .filter(ex => ex.exercise_id !== activeEx)
              .slice(0, 4)
              .map(ex => {
                const last = ex.history[ex.history.length - 1]!;
                const prev = ex.history[ex.history.length - 2];
                const delta = prev ? last.e1rm - prev.e1rm : 0;
                const color = MUSCLE_COLORS[ex.primary_muscles[0]] ?? '#6366f1';
                return (
                  <button
                    key={ex.exercise_id}
                    onClick={() => setSelectedEx(ex.exercise_id)}
                    className="bg-white/3 hover:bg-white/5 rounded-xl p-2.5 text-left transition-colors space-y-1.5"
                  >
                    <div className="flex items-start justify-between gap-1">
                      <p className="text-[10px] font-medium text-gray-300 leading-tight line-clamp-2">
                        {ex.exercise_name}
                      </p>
                      <div className={`text-[9px] shrink-0 flex items-center gap-0.5 ${
                        delta > 0 ? 'text-emerald-400' : delta < 0 ? 'text-red-400' : 'text-gray-500'
                      }`}>
                        {delta > 0 ? <TrendingUp size={8} /> : delta < 0 ? <TrendingDown size={8} /> : null}
                      </div>
                    </div>
                    <Sparkline
                      values={(() => {
                        const map: Record<string, number> = {};
                        ex.history.forEach(h => { map[h.date] = h.e1rm; });
                        return data.weekStarts.map(ws => {
                          const weekEnd = new Date(ws);
                          weekEnd.setDate(weekEnd.getDate() + 7);
                          const we = weekEnd.toISOString().slice(0, 10);
                          const pts = ex.history.filter(h => h.date >= ws && h.date < we);
                          return pts.length ? Math.max(...pts.map(p => p.e1rm)) : 0;
                        });
                      })()}
                      color={color}
                    />
                    <p className="text-[10px] font-semibold" style={{ color }}>
                      {last.e1rm.toFixed(0)} {last.weight_unit}
                    </p>
                  </button>
                );
              })}
          </div>
        </section>
      )}

      {/* ── Movement Balance ───────────────────────────────────────────────── */}
      <section className="bg-gray-900/60 border border-white/5 rounded-2xl p-4 space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-white tracking-wide">Movement Balance</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">Push · pull · hinge · squat · core — last 4 weeks</p>
        </div>
        <DonutChart data={data.movementPattern} />
        {(() => {
          const { push, pull } = data.movementPattern;
          const pushPullRatio = pull > 0 ? push / pull : null;
          if (pushPullRatio === null) return null;
          const balanced = pushPullRatio >= 0.7 && pushPullRatio <= 1.4;
          return (
            <div className={`text-[11px] px-3 py-2 rounded-lg ${
              balanced ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              {balanced
                ? `Push/pull ratio ${pushPullRatio.toFixed(2)} — well balanced`
                : pushPullRatio > 1.4
                  ? `Push/pull ratio ${pushPullRatio.toFixed(2)} — consider adding more pull work`
                  : `Push/pull ratio ${pushPullRatio.toFixed(2)} — consider adding more push work`}
            </div>
          );
        })()}
      </section>

      {/* ── AI Analysis ───────────────────────────────────────────────────── */}
      <AnalysisPanel userId={userId} />
    </div>
  );
}
