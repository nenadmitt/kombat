import { LUDO_MAX_PLAYERS } from '@gaming-platform/core';

import { GameType } from '../db/types/game';

/** Room capacity per game type (Ludo rooms may start below capacity). */
const PLAYER_COUNT_BY_GAME_TYPE: Record<GameType, number> = {
  [GameType.NavalBattle]: 2,
  [GameType.Ludo]: LUDO_MAX_PLAYERS,
  [GameType.TripleCut]: 2,
};

export function getPlayerCountForGameType(gameType: GameType): number {
  return PLAYER_COUNT_BY_GAME_TYPE[gameType];
}
