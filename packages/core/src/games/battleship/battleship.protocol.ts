import type { FleetPlacements, Placement, PowerupKind, Shot } from './battleship.types';

/**
 * Socket event names + payload types shared by the server gateway and the
 * mobile client, so the two sides can't drift.
 */
export const BATTLESHIP_EVENTS = {
  // client -> server
  enter: 'battleship:enter',
  ready: 'battleship:ready',
  fire: 'battleship:fire',
  forfeit: 'battleship:forfeit',
  // server -> game channel
  opponentReady: 'battleship:opponent-ready',
  start: 'battleship:start',
  shot: 'battleship:shot',
  turnTimeout: 'battleship:turn-timeout',
  presence: 'battleship:presence',
  ended: 'battleship:ended',
  // server -> caller only
  error: 'battleship:error',
} as const;

/** How long a player has to move before the turn times out. */
export const TURN_SECONDS = 30;
/** Total turn timeouts a player may accrue before forfeiting the match. */
export const MAX_TIMEOUTS = 3;

/** A shot kind: a normal shot or one of the power-ups. */
export type FireKind = 'single' | PowerupKind;

/** A revealed ship (sent only once fully sunk). */
export type RevealedShip = {
  id: string;
  size: number;
  placement: Placement;
};

// --- client -> server payloads ------------------------------------------------

/** Sent on entering a match screen so the server marks the player present
 *  (online) even before they've submitted a fleet. */
export type EnterPayload = {
  roomId: string;
};

export type ReadyPayload = {
  roomId: string;
  placements: FleetPlacements;
};

export type FirePayload = {
  roomId: string;
  kind: FireKind;
  row: number;
  col: number;
};

export type ForfeitPayload = {
  roomId: string;
};

// --- server -> game channel payloads -----------------------------------------

export type OpponentReadyPayload = {
  userId: string;
};

export type StartPayload = {
  firstTurnUserId: string;
  /** Epoch ms when the first turn times out. */
  turnDeadline: number;
};

export type ShotPayload = {
  byUserId: string;
  kind: FireKind;
  /** Cells resolved by this shot (fresh cells only). */
  cells: Shot[];
  /** Ships that became fully sunk on this shot (the target's ships). */
  sunkShips: RevealedShip[];
  /** Charge points for both players after this shot, keyed by userId. */
  points: Record<string, number>;
  nextTurnUserId: string;
  /** Epoch ms when the next turn times out. */
  turnDeadline: number;
  winnerUserId: string | null;
};

export type TurnTimeoutPayload = {
  /** The player whose turn ran out. */
  timedOutUserId: string;
  nextTurnUserId: string;
  /** Accrued timeout counts per user. */
  timeouts: Record<string, number>;
  /** Epoch ms when the next turn times out. */
  turnDeadline: number;
  /** Set if the timeout cost the player the match (hit MAX_TIMEOUTS). */
  winnerUserId: string | null;
};

export type PresencePayload = {
  userId: string;
  online: boolean;
};

export type EndedPayload = {
  winnerUserId: string;
  reason: 'forfeit';
};

// --- server -> caller only ----------------------------------------------------

export type BattleshipErrorPayload = {
  message: string;
};

// --- REST resume state (personalized per requester) --------------------------

export type BattleshipPhase = 'setup' | 'play' | 'over';

export type BattleshipRoomState = {
  roomId: string;
  phase: BattleshipPhase;
  /** The requester's own fleet, or null before they've submitted. */
  myFleet: FleetPlacements | null;
  /** Whether the opponent has submitted their fleet. */
  opponentReady: boolean;
  /** Shots the requester has fired. */
  myShots: Shot[];
  /** Shots the opponent has fired at the requester. */
  opponentShots: Shot[];
  /** Opponent ships revealed (sunk) so far. */
  revealedOpponentShips: RevealedShip[];
  /** Charge points for both players, keyed by userId. */
  points: Record<string, number>;
  turnUserId: string | null;
  /** Epoch ms when the current turn times out (null outside play). */
  turnDeadline: number | null; 
  /** Accrued turn-timeout counts per user. */
  timeouts: Record<string, number>;
  /** Socket connection state per user. */
  online: Record<string, boolean>;
  winnerUserId: string | null;
  opponentUserId: string;
};
