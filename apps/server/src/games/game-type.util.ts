import {
  CHROMA_MAX_PLAYERS,
  isMultiSeatGame,
  LUDO_MAX_PLAYERS,
  MULTI_SEAT_MIN_PLAYERS,
} from '@gaming-platform/core';

import { GameType } from '../db/types/game';

// Multi-seat semantics (which games accumulate joiners, minimum to start)
// live in core so mobile shares them; re-exported for existing imports.
export { isMultiSeatGame, MULTI_SEAT_MIN_PLAYERS };

/** Room capacity per game type (multi-seat rooms may start below capacity). */
const PLAYER_COUNT_BY_GAME_TYPE: Record<GameType, number> = {
  [GameType.NavalBattle]: 2,
  [GameType.Ludo]: LUDO_MAX_PLAYERS,
  [GameType.TripleCut]: 2,
  [GameType.ChromaClash]: CHROMA_MAX_PLAYERS,
};

export function getPlayerCountForGameType(gameType: GameType): number {
  return PLAYER_COUNT_BY_GAME_TYPE[gameType];
}
