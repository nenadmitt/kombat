import type { ReactNode } from "react";

/**
 * The mobile app's per-game icons (apps/mobile/src/games/GameIcon.tsx), ported
 * to DOM SVG so the site and the app show the same mark. Keep the two in sync.
 */
export type GameKey =
  | "battleships"
  | "chroma"
  | "salvo"
  | "ludo"
  | "tripleCut";

const TEXT = "#e9e9ed";
const ACCENT = "#8ee05a";
const GOLD = "#f5b829";
const MUTED = "#1b1d2b";

const RENDERERS: Record<GameKey, ReactNode> = {
  battleships: (
    <>
      <path
        d="M14 14h36M14 26h36M14 38h36M14 50h36M14 14v36M26 14v36M38 14v36M50 14v36"
        stroke={TEXT}
        strokeOpacity={0.16}
        strokeWidth={1}
      />
      <g stroke={TEXT} strokeWidth={2.4}>
        <path d="M12 40 h40 l-6 10 H19 Z" fill={TEXT} fillOpacity={0.14} />
        <path d="M24 40 v-6 h14 v6" fill={TEXT} fillOpacity={0.08} />
        <path d="M31 34 v-8" />
        <path d="M17 40 l-4 -5 h6" fill="none" />
        <path d="M42 40 l5 -5 h-6" fill="none" />
      </g>
      <path d="M31 26 l7 -3" stroke={ACCENT} strokeWidth={2.4} />
      <path
        d="M8 54 q7 -3 12 0 t12 0 t12 0 t12 0"
        stroke={ACCENT}
        strokeOpacity={0.5}
        strokeWidth={2}
      />
    </>
  ),

  ludo: (
    <>
      <rect
        x={10}
        y={26}
        width={28}
        height={28}
        rx={6}
        fill={TEXT}
        fillOpacity={0.1}
        stroke={TEXT}
        strokeWidth={2.4}
      />
      <circle cx={19} cy={35} r={2.4} fill={TEXT} />
      <circle cx={29} cy={45} r={2.4} fill={TEXT} />
      <rect
        x={34}
        y={10}
        width={22}
        height={22}
        rx={5}
        fill={MUTED}
        stroke={ACCENT}
        strokeWidth={2.4}
        transform="rotate(18 45 21)"
      />
      <circle cx={45} cy={21} r={2.6} fill={ACCENT} />
      <path
        d="M44 56 q8 -4 12 -14"
        stroke={ACCENT}
        strokeOpacity={0.45}
        strokeWidth={2}
        strokeDasharray="1 5"
      />
    </>
  ),

  tripleCut: (
    <>
      <rect
        x={12}
        y={18}
        width={24}
        height={34}
        rx={4}
        fill={MUTED}
        stroke={TEXT}
        strokeOpacity={0.3}
        strokeWidth={2.2}
        transform="rotate(-14 24 35)"
      />
      <rect
        x={18}
        y={16}
        width={24}
        height={34}
        rx={4}
        fill={MUTED}
        stroke={TEXT}
        strokeOpacity={0.55}
        strokeWidth={2.2}
        transform="rotate(-2 30 33)"
      />
      {/* Top card: opaque body first, then the accent tint + stroke over it. */}
      <rect
        x={26}
        y={14}
        width={24}
        height={34}
        rx={4}
        fill={MUTED}
        transform="rotate(11 38 31)"
      />
      <rect
        x={26}
        y={14}
        width={24}
        height={34}
        rx={4}
        fill={ACCENT}
        fillOpacity={0.14}
        stroke={ACCENT}
        strokeWidth={2.4}
        transform="rotate(11 38 31)"
      />
      <path d="M33 26 l6 6 l-6 6" stroke={ACCENT} strokeWidth={2.4} fill="none" />
    </>
  ),

  chroma: (
    <>
      <circle cx={25} cy={26} r={14} fill={ACCENT} fillOpacity={0.5} />
      <circle cx={39} cy={26} r={14} fill={GOLD} fillOpacity={0.3} />
      <circle cx={32} cy={39} r={14} fill={TEXT} fillOpacity={0.22} />
      <circle
        cx={25}
        cy={26}
        r={14}
        stroke={TEXT}
        strokeOpacity={0.45}
        strokeWidth={1.6}
        fill="none"
      />
      <circle
        cx={39}
        cy={26}
        r={14}
        stroke={TEXT}
        strokeOpacity={0.45}
        strokeWidth={1.6}
        fill="none"
      />
      <circle cx={32} cy={39} r={14} stroke={TEXT} strokeWidth={2.2} fill="none" />
    </>
  ),

  salvo: (
    <>
      <path
        d="M22 24 C30 12 44 10 54 14"
        stroke={ACCENT}
        strokeOpacity={0.55}
        strokeWidth={2.2}
        strokeDasharray="4 6"
      />
      <g stroke={TEXT} strokeWidth={2.4}>
        <path d="M14 38 h26 l4 6 H12 Z" fill={TEXT} fillOpacity={0.14} />
        <path d="M20 38 v-6 h13 l3 6" fill={TEXT} fillOpacity={0.08} />
        <path d="M31 30 l12 -8" stroke={ACCENT} />
        <rect x={11} y={45} width={32} height={9} rx={4.5} fill="none" />
      </g>
      <circle cx={17} cy={49.5} r={2.2} fill={TEXT} />
      <circle cx={27} cy={49.5} r={2.2} fill={TEXT} />
      <circle cx={37} cy={49.5} r={2.2} fill={TEXT} />
      <circle cx={46} cy={19} r={3} fill={ACCENT} />
    </>
  ),
};

export function GameIcon({ game, size = 40 }: { game: GameKey; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden>
      <g strokeLinecap="round" strokeLinejoin="round">{RENDERERS[game]}</g>
    </svg>
  );
}
