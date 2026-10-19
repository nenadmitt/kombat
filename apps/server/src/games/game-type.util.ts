import {
  CHROMA_MAX_PLAYERS,
  isMultiSeatGame,
  LUDO_MAX_PLAYERS,
  MULTI_SEAT_MIN_PLAYERS,
} from '@gaming-platform/core';

import { GameType } from '../db/types/game';

export { isMultiSeatGame, MULTI_SEAT_MIN_PLAYERS };

// Multi-seat rooms may start below capacity.
const PLAYER_COUNT_BY_GAME_TYPE: Record<GameType, number> = {
  [GameType.NavalBattle]: 2,
  [GameType.Ludo]: LUDO_MAX_PLAYERS,
  [GameType.TripleCut]: 2,
  [GameType.ChromaClash]: CHROMA_MAX_PLAYERS,
  [GameType.Salvo]: 2,
};

export function getPlayerCountForGameType(gameType: GameType): number {
  return PLAYER_COUNT_BY_GAME_TYPE[gameType];
}
