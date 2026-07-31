export function LogoMark({ size = 34 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden>
      <path d="M28 27 L46.5 27 L42 48 L47 48 L43 74 L28 74 Z" fill="#f3f5fe" />
      <path
        d="M53 27 L72 27 L72 74 L56 74 L51.5 48 L45.5 48 Z"
        fill="#8ee05a"
      />
    </svg>
  );
}
