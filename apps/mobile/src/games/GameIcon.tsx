import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { GameType } from '@gaming-platform/core';

import { colors } from '../theme/colors';

/**
 * The one per-game icon, shared by every surface that shows a game (lobby
 * rows, history, demo cards, create-room picker). From the "Game Icons"
 * design, recolored to the app palette: accent lime for the hero stroke,
 * gold as the second suit color, textPrimary for linework.
 */
type Props = {
  type: GameType;
  size?: number;
};

const text = colors.textPrimary;
const accent = colors.accent;

const RENDERERS: Record<GameType, () => React.ReactNode> = {
  [GameType.NavalBattle]: () => (
    <>
      <Path
        d="M14 14h36M14 26h36M14 38h36M14 50h36M14 14v36M26 14v36M38 14v36M50 14v36"
        stroke={text}
        strokeOpacity={0.16}
        strokeWidth={1}
      />
      <G stroke={text} strokeWidth={2.4}>
        <Path d="M12 40 h40 l-6 10 H19 Z" fill={text} fillOpacity={0.14} />
        <Path d="M24 40 v-6 h14 v6" fill={text} fillOpacity={0.08} />
        <Path d="M31 34 v-8" />
        <Path d="M17 40 l-4 -5 h6" fill="none" />
        <Path d="M42 40 l5 -5 h-6" fill="none" />
      </G>
      <Path d="M31 26 l7 -3" stroke={accent} strokeWidth={2.4} />
      <Path
        d="M8 54 q7 -3 12 0 t12 0 t12 0 t12 0"
        stroke={accent}
        strokeOpacity={0.5}
        strokeWidth={2}
      />
    </>
  ),

  [GameType.Ludo]: () => (
    <>
      <Rect
        x={10}
        y={26}
        width={28}
        height={28}
        rx={6}
        fill={text}
        fillOpacity={0.1}
        stroke={text}
        strokeWidth={2.4}
      />
      <Circle cx={19} cy={35} r={2.4} fill={text} />
      <Circle cx={29} cy={45} r={2.4} fill={text} />
      <Rect
        x={34}
        y={10}
        width={22}
        height={22}
        rx={5}
        fill={colors.surfaceMuted}
        stroke={accent}
        strokeWidth={2.4}
        transform="rotate(18 45 21)"
      />
      <Circle cx={45} cy={21} r={2.6} fill={accent} />
      <Path
        d="M44 56 q8 -4 12 -14"
        stroke={accent}
        strokeOpacity={0.45}
        strokeWidth={2}
        strokeDasharray="1 5"
      />
    </>
  ),

  [GameType.TripleCut]: () => (
    <>
      <Rect
        x={12}
        y={18}
        width={24}
        height={34}
        rx={4}
        fill={colors.surfaceMuted}
        stroke={text}
        strokeOpacity={0.3}
        strokeWidth={2.2}
        transform="rotate(-14 24 35)"
      />
      <Rect
        x={18}
        y={16}
        width={24}
        height={34}
        rx={4}
        fill={colors.surfaceMuted}
        stroke={text}
        strokeOpacity={0.55}
        strokeWidth={2.2}
        transform="rotate(-2 30 33)"
      />
      {/* Top card: opaque body first, then the accent tint + stroke over it. */}
      <Rect
        x={26}
        y={14}
        width={24}
        height={34}
        rx={4}
        fill={colors.surfaceMuted}
        transform="rotate(11 38 31)"
      />
      <Rect
        x={26}
        y={14}
        width={24}
        height={34}
        rx={4}
        fill={accent}
        fillOpacity={0.14}
        stroke={accent}
        strokeWidth={2.4}
        transform="rotate(11 38 31)"
      />
      <Path d="M33 26 l6 6 l-6 6" stroke={accent} strokeWidth={2.4} fill="none" />
    </>
  ),

  [GameType.ChromaClash]: () => (
    <>
      <Circle cx={25} cy={26} r={14} fill={accent} fillOpacity={0.5} />
      <Circle cx={39} cy={26} r={14} fill={colors.gold} fillOpacity={0.3} />
      <Circle cx={32} cy={39} r={14} fill={text} fillOpacity={0.22} />
      <Circle cx={25} cy={26} r={14} stroke={text} strokeOpacity={0.45} strokeWidth={1.6} fill="none" />
      <Circle cx={39} cy={26} r={14} stroke={text} strokeOpacity={0.45} strokeWidth={1.6} fill="none" />
      <Circle cx={32} cy={39} r={14} stroke={text} strokeWidth={2.2} fill="none" />
    </>
  ),

  [GameType.Salvo]: () => (
    <>
      <Path
        d="M22 24 C30 12 44 10 54 14"
        stroke={accent}
        strokeOpacity={0.55}
        strokeWidth={2.2}
        strokeDasharray="4 6"
      />
      <G stroke={text} strokeWidth={2.4}>
        <Path d="M14 38 h26 l4 6 H12 Z" fill={text} fillOpacity={0.14} />
        <Path d="M20 38 v-6 h13 l3 6" fill={text} fillOpacity={0.08} />
        <Path d="M31 30 l12 -8" stroke={accent} />
        <Rect x={11} y={45} width={32} height={9} rx={4.5} fill="none" />
      </G>
      <Circle cx={17} cy={49.5} r={2.2} fill={text} />
      <Circle cx={27} cy={49.5} r={2.2} fill={text} />
      <Circle cx={37} cy={49.5} r={2.2} fill={text} />
      <Circle cx={46} cy={19} r={3} fill={accent} />
    </>
  ),
};

export default function GameIcon({ type, size = 44 }: Props) {
  const render = RENDERERS[type];
  if (!render) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <G strokeLinecap="round" strokeLinejoin="round">{render()}</G>
    </Svg>
  );
}
