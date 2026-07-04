import { GameType } from '@gaming-platform/core';

/** Only real game types get a label — no invented games. */
export const GAME_TYPE_LABELS: Record<GameType, string> = {
  [GameType.NavalBattle]: 'Battleships',
};
