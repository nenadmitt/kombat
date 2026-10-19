import { GameType } from '@gaming-platform/core';

export const GAME_TYPE_LABELS: Record<GameType, string> = {
  [GameType.NavalBattle]: 'Battleships',
  [GameType.Ludo]: 'Ludo Royale',
  [GameType.TripleCut]: 'Triple Cut',
  [GameType.ChromaClash]: 'Chroma Clash',
  [GameType.Salvo]: 'Salvo',
};
