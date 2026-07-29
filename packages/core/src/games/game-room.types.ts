import type { StakeAsset } from './stake.types';

/** Which game a room is for. Stored server-side as smallint, not a Postgres enum. */
export enum GameType {
  NavalBattle = 0,
  Ludo = 1,
  TripleCut = 2,
  ChromaClash = 3,
  Salvo = 4,
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

/**
 * Game types that have a realtime gateway behind them, so a room can actually
 * be played. A value in the enum without an entry here would create a room
 * that starts and then has nothing to drive it.
 */
export const MULTIPLAYER_GAME_TYPES: readonly GameType[] = [
  GameType.NavalBattle,
  GameType.Ludo,
  GameType.TripleCut,
  GameType.ChromaClash,
  GameType.Salvo,
];

/** Whether a room may be created for this game type at all. */
export function supportsMultiplayerRoom(gameType: GameType): boolean {
  return MULTIPLAYER_GAME_TYPES.includes(gameType);
}

/** Games whose rooms fill gradually (join-accumulate, creator start-early,
 *  joiner leave) instead of starting on the first join. */
export function isMultiSeatGame(gameType: GameType): boolean {
  return gameType === GameType.Ludo || gameType === GameType.ChromaClash;
}

/** Fewest joined players (creator included) a multi-seat room may start with. */
export const MULTI_SEAT_MIN_PLAYERS = 2;

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

/**
 * The live-lobby channel. Clients join it (`channel:join { channel: 'lobby' }`)
 * only while the lobby screen is open and leave it when they navigate away, so
 * the server pushes room churn only to people actually looking at the lobby.
 */
export const LOBBY_CHANNEL = 'lobby';

/**
 * Lobby list deltas, broadcast to the LOBBY_CHANNEL as rooms come and go.
 * Only public, listable rooms ever appear here (private rooms never emit).
 */
export const LOBBY_EVENTS = {
  /** A new pending public room to insert. Payload: GameRoomSummary. */
  roomAdded: 'lobby:room-added',
  /** A room that left the lobby (started, filled, cancelled, closed). */
  roomRemoved: 'lobby:room-removed',
  /** A still-pending room whose joinedCount changed. Payload: GameRoomSummary. */
  roomUpdated: 'lobby:room-updated',
} as const;

export type LobbyRoomRemovedPayload = { roomId: string };

/** Free vs staked filter for the lobby. */
export type LobbyStakeFilter = 'all' | 'free' | 'staked';

/**
 * Lobby list filters. All fields optional; an empty/omitted field means "no
 * constraint". Serialized onto the list query and re-applied client-side to
 * live room-added events.
 */
export type LobbyRoomFilters = {
  /** Selected game types; empty/undefined = every game. */
  gameTypes?: GameType[];
  /** all (default) | free (no stake) | staked. */
  stake?: LobbyStakeFilter;
  /** Selected stake tokens (only meaningful for staked); empty = any token. */
  stakeTokens?: StakeAsset[];
};
