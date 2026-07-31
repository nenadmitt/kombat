import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  Stop,
} from 'react-native-svg';

/** Crypto brand marks (chain + token logos) - the icon set ships none of these. */
export type BrandIconName =
  | 'base'
  | 'ethereum'
  | 'solana'
  | 'usdc'
  | 'usdt'
  | 'eth'
  | 'kombat';

type Props = {
  type: BrandIconName;
  size?: number;
  /** Renders every path in this tint instead of brand colors. */
  mono?: string;
};

const RENDERERS: Record<
  BrandIconName,
  (color?: string) => { viewBox: string; body: React.ReactNode }
> = {
  base: color => ({
    viewBox: '0 0 111 111',
    body: (
      <Path
        d="M54.921 110.034c30.438 0 55.113-24.632 55.113-55.017C110.034 24.632 85.359 0 54.921 0 26.043 0 2.353 22.171 0 50.4h72.847v9.234H0c2.353 28.229 26.043 50.4 54.921 50.4z"
        fill={color ?? '#0052FF'}
      />
    ),
  }),

  ethereum: color => ethereumDiamond(color),
  eth: color => ethereumDiamond(color),

  solana: color => ({
    viewBox: '0 0 398 312',
    body: (
      <>
        {!color && (
          <Defs>
            <LinearGradient
              id="sol"
              x1="360.879"
              y1="-37.455"
              x2="141.213"
              y2="383.294"
              gradientUnits="userSpaceOnUse"
            >
              <Stop offset="0" stopColor="#00FFA3" />
              <Stop offset="1" stopColor="#DC1FFF" />
            </LinearGradient>
          </Defs>
        )}
        <Path
          d="M64.6 237.9c2.4-2.4 5.7-3.8 9.2-3.8h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1l62.7-62.7z"
          fill={color ?? 'url(#sol)'}
        />
        <Path
          d="M64.6 3.8C67.1 1.4 70.4 0 73.8 0h317.4c5.8 0 8.7 7 4.6 11.1l-62.7 62.7c-2.4 2.4-5.7 3.8-9.2 3.8H6.5c-5.8 0-8.7-7-4.6-11.1L64.6 3.8z"
          fill={color ?? 'url(#sol)'}
        />
        <Path
          d="M333.1 120.1c-2.4-2.4-5.7-3.8-9.2-3.8H6.5c-5.8 0-8.7 7-4.6 11.1l62.7 62.7c2.4 2.4 5.7 3.8 9.2 3.8h317.4c5.8 0 8.7-7 4.6-11.1l-62.7-62.7z"
          fill={color ?? 'url(#sol)'}
        />
      </>
    ),
  }),

  // Platform token has no real-world logo; a faceted gold gem matches the
  // "◆" glyph + gold tint used for KOMBAT elsewhere.
  kombat: color => ({
    viewBox: '0 0 24 24',
    body: (
      <>
        <Path d="M12 1.5 L22 12 L12 22.5 L2 12 Z" fill={color ?? '#f5b829'} />
        {!color && (
          <Path
            d="M12 1.5 L22 12 L12 12 Z M2 12 L12 12 L12 22.5 Z"
            fill="#000000"
            opacity={0.12}
          />
        )}
      </>
    ),
  }),

  usdc: color => ({
    viewBox: '0 0 32 32',
    body: (
      <>
        <Circle cx="16" cy="16" r="16" fill={color ?? '#2775CA'} />
        <Path
          d="M20.5 18.5c0-2.4-1.4-3.2-4.3-3.5-2-.3-2.4-.8-2.4-1.7 0-.9.6-1.5 2-1.5 1.2 0 1.8.4 2.1 1.4.1.2.3.3.5.3h1c.3 0 .5-.2.5-.5v-.1c-.2-1.3-1.3-2.3-2.6-2.4V9c0-.3-.2-.5-.5-.5h-1c-.3 0-.5.2-.5.5v1c-2 .3-3.2 1.6-3.2 3.2 0 2.3 1.4 3.1 4.2 3.4 1.9.3 2.5.7 2.5 1.8s-1 1.8-2.3 1.8c-1.8 0-2.4-.8-2.6-1.8-.1-.3-.3-.4-.5-.4h-1c-.3 0-.5.2-.5.5v.1c.3 1.6 1.3 2.7 3.4 3v1c0 .3.2.5.5.5h1c.3 0 .5-.2.5-.5v-1c2-.3 3.3-1.7 3.3-3.4z"
          fill="#ffffff"
        />
        <Path
          d="M13 25.5c-5.2-1.9-7.9-7.7-6-12.9 1-2.8 3.2-5 6-6 .3-.1.4-.3.4-.6v-.9c0-.3-.1-.5-.4-.6-.1 0-.3 0-.4.1-6.3 2-9.8 8.7-7.8 15 1.2 3.7 4.1 6.6 7.8 7.8.3.1.6-.1.7-.4.1-.1.1-.2.1-.4v-.9c0-.2-.2-.5-.4-.6zm6.4-20.9c-.3-.1-.6.1-.7.4-.1.1-.1.2-.1.4v.9c0 .3.2.6.4.7 5.2 1.9 7.9 7.7 6 12.9-1 2.8-3.2 5-6 6-.3.1-.4.3-.4.6v.9c0 .3.1.5.4.6.1 0 .3 0 .4-.1 6.3-2 9.8-8.7 7.8-15-1.2-3.8-4.2-6.7-7.8-7.9z"
          fill="#ffffff"
        />
      </>
    ),
  }),

  usdt: color => ({
    viewBox: '0 0 32 32',
    body: (
      <>
        <Circle cx="16" cy="16" r="16" fill={color ?? '#26A17B'} />
        <Path
          d="M17.9 17.3c-.1 0-.7.1-2 .1-1 0-1.8 0-2 0-3.5-.1-6-.7-6-1.5s2.6-1.4 6-1.5v2.4c.2 0 1 .1 2 .1 1.2 0 1.8-.1 1.9-.1v-2.4c3.4.1 6 .7 6 1.5s-2.5 1.4-5.9 1.5zm0-3.2v-2.2h5V8.6H9.1v3.3h5v2.2c-4.1.2-7.2 1-7.2 2s3.1 1.8 7.2 2v7h3.8v-7c4.1-.2 7.2-1 7.2-2s-3.1-1.8-7.2-2z"
          fill="#ffffff"
        />
      </>
    ),
  }),
};

function ethereumDiamond(color?: string) {
  return {
    viewBox: '0 0 24 24',
    body: (
      <>
        <Path
          d="M11.944 17.97 4.58 13.62 11.943 24l7.37-10.38-7.372 4.35z"
          fill={color ?? '#627EEA'}
          opacity={color ? 1 : 0.6}
        />
        <Path
          d="M12.056 0 4.69 12.223l7.365 4.354 7.365-4.35z"
          fill={color ?? '#627EEA'}
        />
      </>
    ),
  };
}

export default function BrandIcon({ type, size = 24, mono }: Props) {
  const { viewBox, body } = RENDERERS[type](mono);
  return (
    <Svg width={size} height={size} viewBox={viewBox}>
      {body}
    </Svg>
  );
}
