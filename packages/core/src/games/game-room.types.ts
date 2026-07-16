import type { StakeAsset } from './stake.types';

/** Which game a room is for. Stored server-side as smallint, not a Postgres enum. */
export enum GameType {
  NavalBattle = 0,
}

/**
 * A room's lifecycle: Pending (waiting for players, can still be closed) ->
 * InProgress (started, can no longer be closed) -> Completed.
 */
export enum GameRoomStatus {
  Pending = 0,
  InProgress = 1,
  Completed = 2,
}

export type GameRoomSummary = {
  id: string;
  gameType: GameType;
  status: GameRoomStatus;
  /** How many players this game type requires (e.g. NavalBattle = 2). */
  playerCount: number;
  /** Stake asset, or null for a free game. */
  stakeToken: StakeAsset | null;
  /** Per-player stake in base units (decimal string), or null for free. */
  stakeAmount: string | null;
  /** Short shareable invite code (e.g. "K7P2QX"); null only for legacy rooms. */
  code: string | null;
  /** Private rooms are hidden from the lobby and joinable only via their code. */
  isPrivate: boolean;
  createdAt: string;
};
