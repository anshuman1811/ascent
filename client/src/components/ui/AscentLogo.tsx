// Three stacked upward-pointing chevrons.
// Bottom = darkest/widest, top = lightest/narrowest — momentum building as they ascend.
// No animation needed; the fade-and-narrow progression IS the motion.

interface Props {
  size?: number;
  showText?: boolean;
  textSize?: string;
}

export default function AscentLogo({ size = 28, showText = false, textSize = 'text-lg' }: Props) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        viewBox="0 0 32 32"
        width={size}
        height={size}
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        {/* Chevron 1 — bottom, widest, darkest */}
        <polyline
          points="4,28 16,20 28,28"
          fill="none"
          stroke="#4338ca"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.45"
        />
        {/* Chevron 2 — middle */}
        <polyline
          points="6,20 16,12 26,20"
          fill="none"
          stroke="#6366f1"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.72"
        />
        {/* Chevron 3 — top, narrowest, brightest */}
        <polyline
          points="8,12 16,4 24,12"
          fill="none"
          stroke="#c4b5fd"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {showText && (
        <span className={`font-bold tracking-tight text-white ${textSize}`}>Ascent</span>
      )}
    </span>
  );
}
