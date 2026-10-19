/** Debris directions, in degrees anticlockwise from due right. */
const SPARKS = [18, 55, 92, 128, 162, 205, 250, 300];

type Props = {
  cx: number;
  cy: number;
  radius: number;
  progress: number;
};

// A radial gradient stands in for mobile's Skia BlurMask; cheaper than a per-frame SVG filter.
export function SalvoBlast({ cx, cy, radius, progress: p }: Props) {
  const coreR = radius * (p < 0.25 ? p * 2.4 : Math.max(0, 0.6 - (p - 0.25) * 0.8));
  const coreOpacity = Math.min(1, p * 8) * (1 - Math.min(1, p / 0.55));
  const glowR = coreR * 1.6;

  const ringR = radius * (0.25 + p * 1.15);
  const ringOpacity = Math.min(1, p * 6) * (1 - p);

  return (
    <g>
      {coreOpacity > 0.01 && (
        <g opacity={coreOpacity}>
          <circle cx={cx} cy={cy} r={glowR} fill="url(#salvo-blast-glow)" />
          <circle cx={cx} cy={cy} r={coreR} fill="#fff3c4" />
        </g>
      )}

      {ringOpacity > 0.01 && (
        <circle
          cx={cx}
          cy={cy}
          r={ringR}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={Math.max(1.4, radius * 0.05)}
          opacity={ringOpacity}
        />
      )}

      {SPARKS.map(angle => {
        const opacity = Math.min(1, p * 5) * (1 - p);
        if (opacity <= 0.01) return null;
        const rad = (angle * Math.PI) / 180;
        // Screen y grows downward, so a positive angle throws debris upward.
        const travel = radius * 1.3 * (1 - (1 - p) * (1 - p));
        const x = cx + Math.cos(rad) * travel;
        const y = cy - Math.sin(rad) * travel + radius * 0.9 * p * p;
        return (
          <circle
            key={angle}
            cx={x}
            cy={y}
            r={Math.max(0, radius * 0.09 * (1 - p))}
            fill="var(--gold)"
            opacity={opacity}
          />
        );
      })}
    </g>
  );
}

/** Mount once per battlefield. */
export function SalvoBlastDefs() {
  return (
    <defs>
      <radialGradient id="salvo-blast-glow">
        <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.9" />
        <stop offset="55%" stopColor="var(--gold)" stopOpacity="0.45" />
        <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
      </radialGradient>
    </defs>
  );
}
