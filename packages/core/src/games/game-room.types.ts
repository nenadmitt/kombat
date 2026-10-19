import type { StakeAsset } from './stake.types';

/** Stored server-side as smallint: never renumber. */
export enum GameType {
  NavalBattle = 0,
  Ludo = 1,
  TripleCut = 2,
  ChromaClash = 3,
  Salvo = 4,
}

export enum GameRoomStatus {
  Pending = 0,
  InProgress = 1,
  Completed = 2,
}

// Each entry needs a realtime gateway, or its rooms would start with nothing driving them.
export const MULTIPLAYER_GAME_TYPES: readonly GameType[] = [
  GameType.NavalBattle,
  GameType.Ludo,
  GameType.TripleCut,
  GameType.ChromaClash,
  GameType.Salvo,
];

export function supportsMultiplayerRoom(gameType: GameType): boolean {
  return MULTIPLAYER_GAME_TYPES.includes(gameType);
}

export function isMultiSeatGame(gameType: GameType): boolean {
  return gameType === GameType.Ludo || gameType === GameType.ChromaClash;
}

export const MULTI_SEAT_MIN_PLAYERS = 2;

export type GameRoomSummary = {
  id: string;
  gameType: GameType;
  status: GameRoomStatus;
  playerCount: number;
  joinedCount: number;
  creatorUserId: string;
  stakeToken: StakeAsset | null;
  stakeAmount: string | null;
  /** Null only for legacy rooms. */
  code: string | null;
  isPrivate: boolean;
  createdAt: string;
};

export const ROOM_EVENTS = {
  /** Legacy 2-player flow: sent to the creator; the joiner navigates from the join response. */
  opponentJoined: 'game:opponent-joined',
  playerJoined: 'game:player-joined',
  playerLeft: 'game:player-left',
  started: 'game:started',
} as const;

export type RoomPlayerJoinedPayload = {
  roomId: string;
  userId: string;
  joinedCount: number;
  playerCount: number;
};

export type RoomPlayerLeftPayload = RoomPlayerJoinedPayload;

export type RoomStartedPayload = {
  roomId: string;
};

// Clients join only while the lobby screen is open.
export const LOBBY_CHANNEL = 'lobby';

// Private rooms never emit lobby events.
export const LOBBY_EVENTS = {
  roomAdded: 'lobby:room-added',
  roomRemoved: 'lobby:room-removed',
  roomUpdated: 'lobby:room-updated',
} as const;

export type LobbyRoomRemovedPayload = { roomId: string };

export type LobbyStakeFilter = 'all' | 'free' | 'staked';

export type LobbyRoomFilters = {
  gameTypes?: GameType[];
  stake?: LobbyStakeFilter;
  stakeTokens?: StakeAsset[];
};
