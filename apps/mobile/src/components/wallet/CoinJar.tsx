import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

import { colors } from '../../theme/colors';

type Coin = { cx: number; cy: number; r: number; opacity?: number };

const SHELF_COINS: Coin[] = [
  { cx: 24, cy: 108, r: 7, opacity: 0.9 },
  { cx: 112, cy: 110, r: 6, opacity: 0.85 },
];

const JAR_COINS: Coin[] = [
  { cx: 46, cy: 52, r: 8 },
  { cx: 64, cy: 54, r: 8.5 },
  { cx: 84, cy: 52, r: 8 },
  { cx: 56, cy: 44, r: 7.5 },
  { cx: 75, cy: 43, r: 7.5 },
  { cx: 66, cy: 35, r: 7 },
  { cx: 97, cy: 47, r: 6.5, opacity: 0.92 },
  { cx: 36, cy: 45, r: 6, opacity: 0.88 },
];

const COIN_SHINE = '#ffd977';

const JAR = 'M18,56 C18,50 120,50 120,56 L110,98 C107,110 31,110 28,98 Z';

function Coins({ coins }: { coins: Coin[] }) {
  return (
    <>
      {coins.map(coin => (
        <Circle
          key={`${coin.cx}-${coin.cy}`}
          cx={coin.cx}
          cy={coin.cy}
          r={coin.r}
          fill={colors.gold}
          opacity={coin.opacity}
        />
      ))}
      {coins.map(coin => (
        <Circle
          key={`shine-${coin.cx}-${coin.cy}`}
          cx={coin.cx}
          cy={coin.cy - 1}
          r={coin.r * 0.62}
          fill={COIN_SHINE}
          opacity={0.55}
        />
      ))}
    </>
  );
}

export default function CoinJar({ width = 138 }: { width?: number }) {
  return (
    <Svg
      width={width}
      height={(width / 138) * 124}
      viewBox="0 0 138 124"
      fill="none"
    >
      <Ellipse cx={69} cy={114} rx={52} ry={7} fill={colors.gold} opacity={0.1} />
      <Coins coins={SHELF_COINS} />

      <Path d={JAR} fill={colors.surfaceMuted} />
      <Path d={JAR} stroke={colors.gold} strokeOpacity={0.34} strokeWidth={1.6} />
      <Path
        d="M36,92 C44,102 94,102 102,92 L100,99 C96,107 42,107 38,99 Z"
        fill={colors.canvas}
        opacity={0.7}
      />
      <Ellipse
        cx={69}
        cy={55}
        rx={51}
        ry={10}
        fill={colors.surface}
        stroke={colors.gold}
        strokeOpacity={0.4}
        strokeWidth={1.6}
      />
      <Ellipse cx={69} cy={56} rx={43} ry={7} fill={colors.canvas} opacity={0.85} />

      <Coins coins={JAR_COINS} />
      <Ellipse cx={69} cy={42} rx={44} ry={26} fill={colors.gold} opacity={0.08} />
    </Svg>
  );
}
