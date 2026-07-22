import { CHROMA_MAX_PLAYERS, LUDO_MAX_PLAYERS } from '@gaming-platform/core';

import { GameType } from '../db/types/game';

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

/**
 * Multi-seat games use the accumulate-joiners room lifecycle (opponent_ids,
 * roster events, start-when-full or creator start-early, leave-while-pending)
 * instead of NavalBattle/TripleCut's fill-on-first-join.
 */
export function isMultiSeatGame(gameType: GameType): boolean {
  return gameType === GameType.Ludo || gameType === GameType.ChromaClash;
}

/** Every multi-seat game starts from two players (creator + one joiner). */
export const MULTI_SEAT_MIN_PLAYERS = 2;
