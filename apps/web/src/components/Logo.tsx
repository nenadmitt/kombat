/** The Kombat ribbon mark - see branding/HANDOFF.md. Never redraw the path. */
const MARK =
  "M0 2 H13 V21 L34 0 H50 V14 H34 L20 28 L34 42 H50 V56 H34 L13 35 V54 H0 Z";

const RATIO = 50 / 56;

export function LogoMark({
  size = 34,
  color = "var(--green)",
}: {
  /** Mark height; the width follows the 50:56 grid. */
  size?: number;
  color?: string;
}) {
  return (
    <svg
      width={Math.round(size * RATIO)}
      height={size}
      viewBox="0 0 50 56"
      fill="none"
      aria-hidden
    >
      <path d={MARK} fill={color} />
    </svg>
  );
}

/**
 * Mark + wordmark, at the handoff's lockup ratios: wordmark 0.88x the mark's
 * height, gap 0.25x. Always lowercase, never re-spaced.
 */
export function LogoLockup({
  size = 30,
  color = "var(--text)",
}: {
  /** Mark height; everything else follows from it. */
  size?: number;
  color?: string;
}) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: Math.round(size * 0.25),
      }}
    >
      <LogoMark size={size} />
      <span
        style={{
          fontFamily: "var(--font-brand)",
          fontWeight: 700,
          fontSize: Math.round(size * 0.88),
          letterSpacing: "-0.045em",
          lineHeight: 1,
          color,
        }}
      >
        kombat
      </span>
    </span>
  );
}
