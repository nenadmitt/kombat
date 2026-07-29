import { GameType } from '@gaming-platform/core';

import { type IconName } from '../components/Icon';

/** Only real game types get a label - no invented games. */
export const GAME_TYPE_LABELS: Record<GameType, string> = {
  [GameType.NavalBattle]: 'Battleships',
  [GameType.Ludo]: 'Ludo Royale',
  [GameType.TripleCut]: 'Triple Cut',
  [GameType.ChromaClash]: 'Chroma Clash',
  [GameType.Salvo]: 'Salvo',
};

/** Shared per-game glyph so lobby / history / games rows stay consistent. */
export const GAME_TYPE_ICONS: Record<GameType, IconName> = {
  [GameType.NavalBattle]: 'crosshair',
  [GameType.Ludo]: 'dice',
  [GameType.TripleCut]: 'hand',
  [GameType.ChromaClash]: 'layers',
  [GameType.Salvo]: 'trajectory',
};
