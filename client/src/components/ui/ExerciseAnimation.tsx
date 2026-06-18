import { useState } from 'react';

interface Props {
  gifUrl: string;
  name: string;
  className?: string;
}

// gifUrl points to frame 0 (e.g. ".../Barbell_Squat/0.jpg").
// We derive frame 1 by replacing the trailing /0.jpg with /1.jpg.
// CSS animation alternates between the two frames at ~1.4s per cycle.
export default function ExerciseAnimation({ gifUrl, name, className = '' }: Props) {
  const [errored, setErrored] = useState(false);

  if (!gifUrl || errored) return null;

  const frame0 = gifUrl;
  const frame1 = gifUrl.replace(/\/0\.jpg$/, '/1.jpg');
  const isTwoFrame = frame1 !== frame0;

  if (!isTwoFrame) {
    return (
      <img
        src={gifUrl}
        alt={name}
        className={`object-contain ${className}`}
        onError={() => setErrored(true)}
      />
    );
  }

  return (
    <div
      className={`relative overflow-hidden ${className}`}
      style={{ aspectRatio: '4/3' }}
    >
      <img
        src={frame0}
        alt={name}
        className="absolute inset-0 w-full h-full object-contain"
        style={{ animation: 'exanim-f0 1.4s steps(1, end) infinite' }}
        onError={() => setErrored(true)}
      />
      <img
        src={frame1}
        alt=""
        aria-hidden
        className="absolute inset-0 w-full h-full object-contain"
        style={{ animation: 'exanim-f1 1.4s steps(1, end) infinite' }}
        onError={() => setErrored(true)}
      />
      <style>{`
        @keyframes exanim-f0 {
          0%, 49.9% { opacity: 1; }
          50%, 100%  { opacity: 0; }
        }
        @keyframes exanim-f1 {
          0%, 49.9% { opacity: 0; }
          50%, 100%  { opacity: 1; }
        }
      `}</style>
    </div>
  );
}
