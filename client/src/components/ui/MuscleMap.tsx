/**
 * MuscleMap — anatomical front+back body SVG with muscle activation highlights.
 *
 * SVG path data from vulovix/body-muscles (Apache 2.0)
 * https://github.com/vulovix/body-muscles
 *
 * Accepts the same props interface as before so ExerciseLibrary + RoutineBuilder
 * don't need changes.
 */
import { useMemo } from 'react';
import { FRONT_MUSCLES, BACK_MUSCLES, INTENSITY_COLORS } from '../MuscleMap/muscleData';

// ── Mapping: app muscle key → detailed SVG path IDs ─────────────────────────
// "front" IDs render on the front SVG, "back" IDs on the back SVG.
const MUSCLE_TO_IDS: Record<string, { front?: string[]; back?: string[] }> = {
  chest: {
    front: ['chest-upper-left','chest-lower-left','chest-upper-right','chest-lower-right'],
  },
  shoulders: {
    front: ['shoulder-front-left','shoulder-side-left','shoulder-front-right','shoulder-side-right'],
    back:  ['deltoid-rear-left','deltoid-rear-right'],
  },
  rear_delts: {
    back: ['deltoid-rear-left','deltoid-rear-right'],
  },
  biceps: {
    front: ['biceps-left','biceps-right'],
  },
  triceps: {
    back: ['triceps-long-left','triceps-lateral-left','triceps-long-right','triceps-lateral-right'],
  },
  forearms: {
    front: ['forearm-left','forearm-right'],
    back:  ['forearm-flexors-left','forearm-extensors-left','forearm-flexors-right','forearm-extensors-right'],
  },
  core: {
    front: ['abs-upper-left','abs-upper-right','abs-lower-left','abs-lower-right',
            'serratus-anterior-left','serratus-anterior-right','obliques-left','obliques-right'],
  },
  hip_flexor: {
    front: ['hip-flexor-left','hip-flexor-right'],
  },
  quads: {
    front: ['quads-left','quads-right','adductors-left','adductors-right'],
  },
  hamstrings: {
    back: ['hamstrings-medial-left','hamstrings-lateral-left','hamstrings-medial-right','hamstrings-lateral-right'],
  },
  glutes: {
    back: ['gluteus-maximus-left','gluteus-maximus-right','gluteus-medius-left','gluteus-medius-right'],
  },
  calves: {
    front: ['tibialis-anterior-left','tibialis-anterior-right'],
    back:  ['calves-gastroc-medial-left','calves-gastroc-lateral-left','calves-soleus-left',
            'calves-gastroc-medial-right','calves-gastroc-lateral-right','calves-soleus-right'],
  },
  upper_back: {
    back: ['traps-upper-left','traps-mid-left','traps-lower-left',
           'traps-upper-right','traps-mid-right','traps-lower-right'],
  },
  lats: {
    back: ['lats-upper-left','lats-mid-left','lats-lower-left',
           'lats-upper-right','lats-mid-right','lats-lower-right'],
  },
  lower_back: {
    back: ['lower-back-erectors-left','lower-back-ql-left',
           'lower-back-erectors-right','lower-back-ql-right'],
  },
  rotator_cuff: {
    back: ['deltoid-rear-left','deltoid-rear-right'],
  },
};

// Non-muscle body parts: always rendered in neutral color, never highlighted
const BODY_PARTS = new Set([
  'head','face','neck-right','neck-left','head-back','nape',
  'elbow-left','elbow-right','hand-left','hand-right',
  'foot-left','foot-right','knee-left','knee-right',
  'knee-back-left','knee-back-right','spine',
  'hand-back-left','hand-back-right','foot-back-left','foot-back-right',
]);

// Build a flat Record<svgId, intensity 0-10> from our props
function buildActivationMap(
  primary: string[],
  secondary: string[],
  primaryCounts?: Record<string, number>,
  secondaryCounts?: Record<string, number>,
): { front: Record<string, number>; back: Record<string, number> } {
  const front: Record<string, number> = {};
  const back: Record<string, number>  = {};

  function set(svgId: string, view: 'front' | 'back', intensity: number) {
    const map = view === 'front' ? front : back;
    // Take maximum if already set (multiple app muscles map to same SVG id)
    map[svgId] = Math.max(map[svgId] ?? 0, intensity);
  }

  function apply(muscleKey: string, pCount: number, sCount: number) {
    const mapping = MUSCLE_TO_IDS[muscleKey];
    if (!mapping) return;

    let intensity = 0;
    if (pCount >= 3)      intensity = 10;
    else if (pCount === 2) intensity = 8;
    else if (pCount === 1) intensity = 7;
    else if (sCount >= 2)  intensity = 4;
    else if (sCount === 1) intensity = 3;

    if (intensity === 0) return;
    if (mapping.front) mapping.front.forEach(id => set(id, 'front', intensity));
    if (mapping.back)  mapping.back.forEach(id  => set(id, 'back',  intensity));
  }

  if (primaryCounts !== undefined && secondaryCounts !== undefined) {
    const allKeys = new Set([...Object.keys(primaryCounts), ...Object.keys(secondaryCounts)]);
    allKeys.forEach(k => apply(k, primaryCounts[k] ?? 0, secondaryCounts[k] ?? 0));
  } else {
    primary.forEach(k   => apply(k, 1, 0));
    secondary.forEach(k => apply(k, 0, 1));
  }

  return { front, back };
}

function pathFill(id: string, activation: Record<string, number>): string {
  if (BODY_PARTS.has(id)) return '#1e293b';
  const intensity = activation[id] ?? 0;
  if (intensity === 0) return '#293548';
  return INTENSITY_COLORS[Math.min(10, Math.round(intensity))] ?? INTENSITY_COLORS[0];
}

function BodyView({
  muscles,
  viewBox,
  activation,
  label,
}: {
  muscles: typeof FRONT_MUSCLES;
  viewBox: string;
  activation: Record<string, number>;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1 flex-1">
      <svg
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="auto"
        style={{ display: 'block' }}
      >
        {muscles.map(m => (
          <path
            key={m.id}
            d={m.path}
            fill={pathFill(m.id, activation)}
            stroke="#0d1520"
            strokeWidth="0.08"
            style={{ transition: 'fill 0.25s ease' }}
          >
            <title>{m.name}</title>
          </path>
        ))}
      </svg>
      <span className="text-[8px] text-gray-600 uppercase tracking-widest">{label}</span>
    </div>
  );
}

// ── Public component ─────────────────────────────────────────────────────────

interface MuscleMapProps {
  primary?: string[];
  secondary?: string[];
  primaryCounts?: Record<string, number>;
  secondaryCounts?: Record<string, number>;
  className?: string;
}

export default function MuscleMap({
  primary = [],
  secondary = [],
  primaryCounts,
  secondaryCounts,
  className = '',
}: MuscleMapProps) {
  const { front, back } = useMemo(
    () => buildActivationMap(primary, secondary, primaryCounts, secondaryCounts),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [JSON.stringify({ primary, secondary, primaryCounts, secondaryCounts })],
  );

  return (
    <div className={`flex gap-2 ${className}`}>
      <BodyView muscles={FRONT_MUSCLES} viewBox="0 0 35 93" activation={front} label="Front" />
      <BodyView muscles={BACK_MUSCLES}  viewBox="37 0 35 93" activation={back}  label="Back"  />
    </div>
  );
}

export function MuscleMapLegend({ mode }: { mode: 'exercise' | 'routine' }) {
  if (mode === 'exercise') {
    return (
      <div className="flex gap-3 justify-center">
        {([
          { color: INTENSITY_COLORS[7], label: 'Primary' },
          { color: INTENSITY_COLORS[3], label: 'Secondary' },
          { color: '#293548',           label: 'Inactive'  },
        ] as const).map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
            <span className="text-[10px] text-gray-500">{label}</span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="flex gap-3 justify-center flex-wrap">
      {([
        { color: INTENSITY_COLORS[10], label: '3+ exercises' },
        { color: INTENSITY_COLORS[8],  label: '2 exercises'  },
        { color: INTENSITY_COLORS[7],  label: '1 exercise'   },
        { color: INTENSITY_COLORS[3],  label: 'Secondary'    },
        { color: '#293548',            label: 'Not targeted' },
      ] as const).map(({ color, label }) => (
        <div key={label} className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
          <span className="text-[10px] text-gray-500">{label}</span>
        </div>
      ))}
    </div>
  );
}
