import { GameType } from '@gaming-platform/core';
import {
  Crosshair,
  DiceFive,
  Hand,
  Stack,
  Target,
  type Icon,
} from '@phosphor-icons/react';

const ICONS: Record<GameType, Icon> = {
  [GameType.NavalBattle]: Crosshair,
  [GameType.Ludo]: DiceFive,
  [GameType.TripleCut]: Hand,
  [GameType.ChromaClash]: Stack,
  [GameType.Salvo]: Target,
};

type Props = {
  gameType: GameType;
  /** Tile edge in px. The glyph scales with it. */
  size?: number;
};

export function GameIcon({ gameType, size = 34 }: Props) {
  const Glyph = ICONS[gameType];
  return (
    <span className="tile" style={{ width: size, height: size }}>
      <Glyph size={Math.round(size * 0.5)} />
    </span>
  );
}
