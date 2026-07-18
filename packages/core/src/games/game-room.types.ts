import type { StakeAsset } from './stake.types';

/** Which game a room is for. Stored server-side as smallint, not a Postgres enum. */
export enum GameType {
  NavalBattle = 0,
  Ludo = 1,
  TripleCut = 2,
  ChromaClash = 3,
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
  /** Room capacity for this game type (NavalBattle = 2, Ludo = 4). */
  playerCount: number;
  /** Players currently in the room, creator included. */
  joinedCount: number;
  /** The room's creator - the only player who may start a Ludo room early. */
  creatorUserId: string;
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

/**
 * Room lifecycle socket events (game-agnostic, sent outside any match
 * channel - to the affected users directly).
 */
export const ROOM_EVENTS = {
  /**
   * Legacy 2-player flow (NavalBattle): the room filled and the match starts
   * now. Sent to the creator; the joiner navigates from the join response.
   */
  opponentJoined: 'game:opponent-joined',
  /** A player joined a multi-player (Ludo) room that is still waiting. */
  playerJoined: 'game:player-joined',
  /** A player left a still-Pending multi-player room. */
  playerLeft: 'game:player-left',
  /** A multi-player room started (room full, or the creator started early). */
  started: 'game:started',
} as const;

export type RoomPlayerJoinedPayload = {
  roomId: string;
  userId: string;
  /** Players now in the room, creator included. */
  joinedCount: number;
  /** Room capacity. */
  playerCount: number;
};

export type RoomPlayerLeftPayload = RoomPlayerJoinedPayload;

export type RoomStartedPayload = {
  roomId: string;
};
