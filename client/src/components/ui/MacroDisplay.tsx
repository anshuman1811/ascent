import type { MacroTotals } from '../../types';

interface MacroBarProps {
  macros: MacroTotals;
  targets?: Partial<MacroTotals>;
}

const MACRO_COLORS = {
  protein: 'bg-blue-500',
  carbs:   'bg-yellow-500',
  fat:     'bg-orange-500',
};

export function MacroBar({ macros, targets }: MacroBarProps) {
  const totalCal = macros.protein_g * 4 + macros.carbs_g * 4 + macros.fat_g * 9;

  const segments = [
    { key: 'protein', cal: macros.protein_g * 4, color: MACRO_COLORS.protein },
    { key: 'carbs',   cal: macros.carbs_g   * 4, color: MACRO_COLORS.carbs   },
    { key: 'fat',     cal: macros.fat_g     * 9, color: MACRO_COLORS.fat     },
  ];

  return (
    <div className="flex h-1.5 rounded-full overflow-hidden bg-gray-800 gap-px">
      {segments.map(s => (
        <div
          key={s.key}
          className={`${s.color} transition-all`}
          style={{ width: totalCal > 0 ? `${(s.cal / totalCal) * 100}%` : '0%' }}
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
  type Item = { label: string; value: string | number; color: string; unit?: string };
  const items: Item[] = compact
    ? [
        { label: 'Cal', value: Math.round(macros.calories), color: 'text-white' },
        { label: 'P', value: `${Math.round(macros.protein_g)}g`, color: 'text-blue-400' },
        { label: 'C', value: `${Math.round(macros.carbs_g)}g`, color: 'text-yellow-400' },
        { label: 'F', value: `${Math.round(macros.fat_g)}g`, color: 'text-orange-400' },
      ]
    : [
        { label: 'Calories', value: Math.round(macros.calories), color: 'text-white', unit: 'kcal' },
        { label: 'Protein',  value: `${Math.round(macros.protein_g)}g`,  color: 'text-blue-400' },
        { label: 'Carbs',    value: `${Math.round(macros.carbs_g)}g`,    color: 'text-yellow-400' },
        { label: 'Fat',      value: `${Math.round(macros.fat_g)}g`,      color: 'text-orange-400' },
      ];

  return (
    <div className={`flex gap-${compact ? '2' : '4'}`}>
      {items.map(({ label, value, color, unit }) => (
        <div key={label} className="flex flex-col items-center">
          <span className={`font-semibold ${compact ? 'text-sm' : 'text-lg'} ${color}`}>
            {value}{unit ? ` ${unit}` : ''}
          </span>
          <span className={`text-gray-500 ${compact ? 'text-[10px]' : 'text-xs'}`}>{label}</span>
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

export function CalorieRing({ consumed, target, burned = 0, size = 120 }: CalorieRingProps) {
  const net = consumed - burned;
  const pct = Math.min(net / (target || 1), 1);
  const r = (size / 2) - 10;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - pct);
  const over = net > target + 50;
  const under = net < target - 50;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1f2937" strokeWidth={8} />
        <circle
          cx={size/2} cy={size/2} r={r} fill="none"
          stroke={over ? '#ef4444' : under ? '#6366f1' : '#22c55e'}
          strokeWidth={8} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={offset}
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold text-white">{Math.round(net)}</span>
        <span className="text-xs text-gray-400">/ {target}</span>
      </div>
    </div>
  );
}
