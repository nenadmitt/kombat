/** Debris directions, in degrees anticlockwise from due right. */
const SPARKS = [18, 55, 92, 128, 162, 205, 250, 300];

type Props = {
  /** Blast centre in screen space. */
  cx: number;
  cy: number;
  /** Radius the shockwave reaches at full expansion. */
  radius: number;
  /** 0 to 1 over the life of the blast. */
  progress: number;
};

/**
 * A shell going off: a hot core that flashes and collapses, a shockwave ring
 * riding out past it, and debris thrown clear. Sized by `radius`, so the same
 * component covers a shell landing and a hull being destroyed.
 *
 * The mobile version blurs the core with a Skia BlurMask; here the same look
 * comes from a radial gradient, which costs nothing to repaint next to an SVG
 * filter running every frame.
 */
export function SalvoBlast({ cx, cy, radius, progress: p }: Props) {
  // The core punches out fast then dies back, leaving the ring to travel on.
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
        // Debris decelerates as it flies and sags under gravity on the way out.
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

/** The gradient standing in for the mobile blur. Mount once per battlefield. */
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
