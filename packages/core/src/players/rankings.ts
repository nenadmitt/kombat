import type { GameType } from '../games/game-room.types';
import { StakeAsset } from '../games/stake.types';

/** Void rooms award nothing. */
export const RANKING_POINTS_FREE_GAME = 5;
export const RANKING_POINTS_STAKED_GAME = 10;

export const RANKING_COIN_POINTS: Partial<Record<StakeAsset, number>> = {
  [StakeAsset.Kombat]: 0.1,
  [StakeAsset.Usdc]: 1,
  [StakeAsset.Usdt]: 1,
  [StakeAsset.Dai]: 1,
};

export type RankingEntry = {
  /** 1-based, offset included. */
  rank: number;
  userId: string;
  username: string | null;
  ensName: string | null;
  games: number;
  wins: number;
  stakedGames: number;
  playPoints: number;
  coinPoints: number;
  totalPoints: number;
};

export type RankingsQuery = {
  gameType?: GameType;
  limit?: number;
  offset?: number;
};
