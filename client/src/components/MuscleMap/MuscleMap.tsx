/**
 * MuscleMap — Interactive anatomical SVG body map for React
 *
 * SVG path data sourced from vulovix/body-muscles (Apache 2.0)
 * https://github.com/vulovix/body-muscles
 *
 * Usage:
 *   <MuscleMap
 *     view="FRONT"
 *     highlighted={{ "biceps-left": 8, "biceps-right": 8, "chest-lower-left": 5 }}
 *     onMuscleClick={(id, name) => console.log(id, name)}
 *   />
 *
 * `highlighted` maps muscle IDs to an intensity 0–10.
 * 0 = inactive (grey), 1–10 = yellow → orange → red.
 */

import React, { useState } from "react";
import {
  FRONT_MUSCLES,
  BACK_MUSCLES,
  INTENSITY_COLORS,
  type ViewSide,
  type MuscleDef,
} from "./muscleData";

export interface MuscleMapProps {
  /** Which body side to render */
  view: ViewSide;
  /**
   * Map of muscleId → intensity (0–10).
   * Omitted muscles are rendered as inactive (grey).
   */
  highlighted?: Record<string, number>;
  /** Called when the user clicks a muscle path */
  onMuscleClick?: (id: string, name: string) => void;
  /** Width of the SVG container (CSS value, default "100%") */
  width?: string;
  /** Optional extra className on the wrapper div */
  className?: string;
}

// Front view: "0 0 35 93"   Back view: "37 0 35 93"
const VIEW_BOX: Record<ViewSide, string> = {
  FRONT: "0 0 35 93",
  BACK: "37 0 35 93",
};

export function MuscleMap({
  view,
  highlighted = {},
  onMuscleClick,
  width = "100%",
  className = "",
}: MuscleMapProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const muscles: MuscleDef[] = view === "FRONT" ? FRONT_MUSCLES : BACK_MUSCLES;

  function getFill(id: string): string {
    const intensity = highlighted[id] ?? 0;
    const clamped = Math.min(10, Math.max(0, Math.round(intensity)));
    const base = INTENSITY_COLORS[clamped] ?? INTENSITY_COLORS[0];
    // Lighten slightly on hover
    if (hoveredId === id) return clamped === 0 ? "#cbd5e1" : base + "cc";
    return base;
  }

  return (
    <div
      className={className}
      style={{ width, display: "inline-block" }}
      aria-label={`${view === "FRONT" ? "Anterior" : "Posterior"} body muscle map`}
    >
      <svg
        viewBox={VIEW_BOX[view]}
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="auto"
        role="img"
        aria-label={`${view === "FRONT" ? "Front" : "Back"} view muscle diagram`}
      >
        {muscles.map((muscle) => (
          <path
            key={muscle.id}
            d={muscle.path}
            fill={getFill(muscle.id)}
            stroke="#475569"
            strokeWidth="0.15"
            style={{
              cursor: onMuscleClick ? "pointer" : "default",
              transition: "fill 0.2s ease",
            }}
            aria-label={muscle.name}
            role={onMuscleClick ? "button" : undefined}
            onClick={() => onMuscleClick?.(muscle.id, muscle.name)}
            onMouseEnter={() => setHoveredId(muscle.id)}
            onMouseLeave={() => setHoveredId(null)}
          >
            <title>{muscle.name}</title>
          </path>
        ))}
      </svg>

      {/* Optional tooltip */}
      {hoveredId && (
        <div
          style={{
            textAlign: "center",
            fontSize: "0.75rem",
            color: "#64748b",
            marginTop: "0.25rem",
          }}
        >
          {muscles.find((m) => m.id === hoveredId)?.name}
        </div>
      )}
    </div>
  );
}

export default MuscleMap;
