import type { ReactNode } from 'react';

/**
 * Token brand marks, ported from the mobile app's BrandIcon. The icon set
 * ships none of these, so they are drawn here.
 */
const MARKS: Record<string, { viewBox: string; body: ReactNode }> = {
  ETH: {
    viewBox: '0 0 24 24',
    body: (
      <>
        <path
          d="M11.944 17.97 4.58 13.62 11.943 24l7.37-10.38-7.372 4.35z"
          fill="#627EEA"
          opacity={0.6}
        />
        <path d="M12.056 0 4.69 12.223l7.365 4.354 7.365-4.35z" fill="#627EEA" />
      </>
    ),
  },
  KOMBAT: {
    viewBox: '0 0 24 24',
    body: (
      <>
        <path d="M12 1.5 L22 12 L12 22.5 L2 12 Z" fill="#f5b829" />
        <path
          d="M12 1.5 L22 12 L12 12 Z M2 12 L12 12 L12 22.5 Z"
          fill="#000000"
          opacity={0.12}
        />
      </>
    ),
  },
  USDC: {
    viewBox: '0 0 32 32',
    body: (
      <>
        <circle cx="16" cy="16" r="16" fill="#2775CA" />
        <path
          d="M20.5 18.5c0-2.4-1.4-3.2-4.3-3.5-2-.3-2.4-.8-2.4-1.7 0-.9.6-1.5 2-1.5 1.2 0 1.8.4 2.1 1.4.1.2.3.3.5.3h1c.3 0 .5-.2.5-.5v-.1c-.2-1.3-1.3-2.3-2.6-2.4V9c0-.3-.2-.5-.5-.5h-1c-.3 0-.5.2-.5.5v1c-2 .3-3.2 1.6-3.2 3.2 0 2.3 1.4 3.1 4.2 3.4 1.9.3 2.5.7 2.5 1.8s-1 1.8-2.3 1.8c-1.8 0-2.4-.8-2.6-1.8-.1-.3-.3-.4-.5-.4h-1c-.3 0-.5.2-.5.5v.1c.3 1.6 1.3 2.7 3.4 3v1c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5v-1c2-.3 3.3-1.7 3.3-3.4z"
          fill="#ffffff"
        />
        <path
          d="M13 25.5c-5.2-1.9-7.9-7.7-6-12.9 1-2.8 3.2-5 6-6 .3-.1.4-.3.4-.6v-.9c0-.3-.1-.5-.4-.6-.1 0-.3 0-.4.1-6.3 2-9.8 8.7-7.8 15 1.2 3.7 4.1 6.6 7.8 7.8.3.1.6-.1.7-.4.1-.1.1-.2.1-.4v-.9c0-.2-.2-.5-.4-.6zm6.4-20.9c-.3-.1-.6.1-.7.4-.1.1-.1.2-.1.4v.9c0 .3.2.6.4.7 5.2 1.9 7.9 7.7 6 12.9-1 2.8-3.2 5-6 6-.3.1-.4.3-.4.6v.9c0 .3.1.5.4.6.1 0 .3 0 .4-.1 6.3-2 9.8-8.7 7.8-15-1.2-3.8-4.2-6.7-7.8-7.9z"
          fill="#ffffff"
        />
      </>
    ),
  },
  USDT: {
    viewBox: '0 0 32 32',
    body: (
      <>
        <circle cx="16" cy="16" r="16" fill="#26A17B" />
        <path
          d="M17.9 17.3c-.1 0-.7.1-2 .1-1 0-1.8 0-2 0-3.5-.1-6-.7-6-1.5s2.6-1.4 6-1.5v2.4c.2 0 1 .1 2 .1 1.2 0 1.8-.1 1.9-.1v-2.4c3.4.1 6 .7 6 1.5s-2.5 1.4-5.9 1.5zm0-3.2v-2.2h5V8.6H9.1v3.3h5v2.2c-4.1.2-7.2 1-7.2 2s3.1 1.8 7.2 2v7h3.8v-7c4.1-.2 7.2-1 7.2-2s-3.1-1.8-7.2-2z"
          fill="#ffffff"
        />
      </>
    ),
  },
  DAI: {
    viewBox: '0 0 32 32',
    body: (
      <>
        <circle cx="16" cy="16" r="16" fill="#F5AC37" />
        <path
          d="M16 6l7.5 7.5h2.3v2h-1.6a8.6 8.6 0 010 1h1.6v2h-2.3L16 26l-7.5-7.5H6.2v-2h1.6a8.6 8.6 0 010-1H6.2v-2h2.3L16 6zm-4.6 12.5L16 23.1l4.6-4.6h-9.2zm10-2a6.6 6.6 0 000-1H10.6a6.6 6.6 0 000 1h10.8zm-.8-3L16 8.9l-4.6 4.6h9.2z"
          fill="#ffffff"
        />
      </>
    ),
  },
};

/** Unknown symbols render nothing, so a new asset degrades quietly. */
export function TokenIcon({
  symbol,
  size = 24,
}: {
  symbol: string;
  size?: number;
}) {
  const mark = MARKS[symbol];
  if (!mark) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox={mark.viewBox}
      aria-hidden
      focusable="false"
      style={{ flex: 'none' }}
    >
      {mark.body}
    </svg>
  );
}
