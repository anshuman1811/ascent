import { useState, useEffect, type CSSProperties } from 'react';
import type { MacroTotals } from '../../types';

interface MacroBarProps {
  macros: MacroTotals;
  targets?: Partial<MacroTotals>;
}

// Colorblind-safe: a single hue (indigo) at three lightness steps, each with a
// distinct fill pattern so segments are distinguishable by shape, not just color.
const MACRO_SEGMENTS = [
  { key: 'protein', label: 'P', className: 'bg-indigo-300', pattern: undefined },
  { key: 'carbs',   label: 'C', className: 'bg-indigo-500', pattern: 'striped' as const },
  { key: 'fat',     label: 'F', className: 'bg-indigo-800', pattern: 'dotted' as const },
];

function patternStyle(pattern?: 'striped' | 'dotted'): CSSProperties {
  if (pattern === 'striped') return {
    backgroundImage: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.3) 0 3px, transparent 3px 6px)',
  };
  if (pattern === 'dotted') return {
    backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.45) 1px, transparent 1.5px)',
    backgroundSize: '5px 5px',
  };
  return {};
}

export function MacroBar({ macros }: MacroBarProps) {
  const totalCal = macros.protein_g * 4 + macros.carbs_g * 4 + macros.fat_g * 9;

  const segments = [
    { ...MACRO_SEGMENTS[0], cal: macros.protein_g * 4 },
    { ...MACRO_SEGMENTS[1], cal: macros.carbs_g   * 4 },
    { ...MACRO_SEGMENTS[2], cal: macros.fat_g     * 9 },
  ];

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-800 gap-px">
      {segments.map(s => (
        <div
          key={s.key}
          className={`${s.className} transition-all`}
          style={{ width: totalCal > 0 ? `${(s.cal / totalCal) * 100}%` : '0%', ...patternStyle(s.pattern) }}
        />
      ))}
    </div>
  );
}

interface MacroPillsProps {
  macros: MacroTotals;
  compact?: boolean;
}

export function MacroPills({ macros, compact }: MacroPillsProps) {
  type Item = { label: string; value: string | number; unit?: string };
  const items: Item[] = compact
    ? [
        { label: 'Cal', value: Math.round(macros.calories) },
        { label: 'P', value: `${Math.round(macros.protein_g)}g` },
        { label: 'C', value: `${Math.round(macros.carbs_g)}g` },
        { label: 'Fat', value: `${Math.round(macros.fat_g)}g` },
        { label: 'Fib', value: `${Math.round(macros.fiber_g)}g` },
      ]
    : [
        { label: 'Calories', value: Math.round(macros.calories), unit: 'kcal' },
        { label: 'Protein',  value: `${Math.round(macros.protein_g)}g` },
        { label: 'Carbs',    value: `${Math.round(macros.carbs_g)}g` },
        { label: 'Fat',      value: `${Math.round(macros.fat_g)}g` },
        { label: 'Fiber',    value: `${Math.round(macros.fiber_g)}g` },
      ];

  return (
    <div className={`flex gap-${compact ? '2' : '4'}`}>
      {items.map(({ label, value, unit }) => (
        <div key={label} className="flex flex-col items-center">
          <span className={`font-semibold ${compact ? 'text-sm' : 'text-lg'} text-white`}>
            {value}{unit ? ` ${unit}` : ''}
          </span>
          <span className={`text-gray-500 ${compact ? 'text-xs' : 'text-xs'} ${compact ? 'opacity-80' : ''}`} style={compact ? { fontSize: '10px' } : undefined}>{label}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Full macro breakdown — used in the expanded meal view ────────────────────
// Cleaner, colorblind-safe layout: each macro gets a labeled row with its own
// bar (no relative-proportion guessing) instead of a packed multi-color pill row.

interface MacroBreakdownProps {
  macros: MacroTotals;
}

export function MacroBreakdown({ macros }: MacroBreakdownProps) {
  const rows = [
    { label: 'Protein', value: macros.protein_g, capPerCal: 0.5 },
    { label: 'Carbs',   value: macros.carbs_g,   capPerCal: 0.5 },
    { label: 'Fat',     value: macros.fat_g,     capPerCal: 0.25 },
    { label: 'Fiber',   value: macros.fiber_g,   capPerCal: 0.05 },
    { label: 'Sugar',   value: macros.sugar_g,   capPerCal: 0.25 },
  ];
  // Scale each bar relative to the largest value in the set so bars are comparable at a glance.
  const max = Math.max(...rows.map(r => r.value), 1);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-xs text-gray-500">Calories</span>
        <span className="text-sm font-semibold text-white">{Math.round(macros.calories)} kcal</span>
      </div>
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-2">
          <span className="text-xs text-gray-400 w-14 shrink-0">{r.label}</span>
          <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
            <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${Math.min((r.value / max) * 100, 100)}%` }} />
          </div>
          <span className="text-xs text-white font-medium w-10 text-right shrink-0">{Math.round(r.value)}g</span>
        </div>
      ))}
    </div>
  );
}

interface CalorieRingProps {
  consumed: number;
  target: number;
  burned?: number;
  size?: number;
}

export function CalorieRing({ consumed, target, burned = 0, size = 132 }: CalorieRingProps) {
  const net = consumed - burned;
  const hasTarget = target > 0;
  const pct = hasTarget ? Math.min(net / target, 1) : 0;
  const r = (size / 2) - 10;
  const circ = 2 * Math.PI * r;
  const over = hasTarget && net > target + 50;
  const under = hasTarget && net < target - 50;

  // Animate from 0 on mount; subsequent data changes animate via CSS transition
  const [displayPct, setDisplayPct] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDisplayPct(Math.min(pct, 1)), 80);
    return () => clearTimeout(t);
  }, [pct]);
  const offset = circ * (1 - displayPct);

  // Adherence-neutral: green = on target (celebrate), indigo = under (neutral), amber = over (nudge, not shame)
  const strokeColor = over ? '#f59e0b' : under ? '#6366f1' : '#22c55e';

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {/* Track */}
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f2937" strokeWidth={9} />
        {hasTarget && (
          <circle
            cx={size/2} cy={size/2} r={r} fill="none"
            stroke={strokeColor}
            strokeWidth={9} strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={offset}
            style={{ transition: 'stroke-dashoffset 0.6s cubic-bezier(0.34,1.56,0.64,1), stroke 0.4s ease' }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-0.5">
        <span className="text-3xl font-bold text-white tabular-nums leading-none">{Math.round(net)}</span>
        <span className="text-[11px] text-gray-500 leading-none">{hasTarget ? `/ ${target}` : '—'}</span>
      </div>
    </div>
  );
}
