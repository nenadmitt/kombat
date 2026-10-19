// Traced from branding/assets/kombat-mark-currentcolor.svg; keep in step with it.
const MARK =
  'M0 2 H13 V21 L34 0 H50 V14 H34 L20 28 L34 42 H50 V56 H34 L13 35 V54 H0 Z';

type Props = {
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
