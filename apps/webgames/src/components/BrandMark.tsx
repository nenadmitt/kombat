/**
 * The Kombat mark, traced from branding/assets/kombat-mark-currentcolor.svg.
 * Keep it in step with that file rather than redrawing it here.
 */
const MARK =
  'M0 2 H13 V21 L34 0 H50 V14 H34 L20 28 L34 42 H50 V56 H34 L13 35 V54 H0 Z';

type Props = {
  /** Rendered height; the width follows the mark's 50x56 aspect. */
  size?: number;
  color?: string;
};

export function BrandMark({ size = 28, color = 'var(--lime)' }: Props) {
  return (
    <svg
      width={(size * 50) / 56}
      height={size}
      viewBox="0 0 50 56"
      fill="none"
      aria-hidden
      focusable="false"
      style={{ flex: 'none' }}
    >
      <path d={MARK} fill={color} />
    </svg>
  );
}

/**
 * The mark plus the wordmark, spaced as the lockup pairs them. The type is
 * lowercase and tightly tracked; it is a wordmark, not a label.
 */
export function BrandLockup({ size = 28 }: { size?: number }) {
  return (
    <>
      <BrandMark size={size} />
      <span className="rail-brand-word" style={{ fontSize: size }}>
        kombat
      </span>
    </>
  );
}
