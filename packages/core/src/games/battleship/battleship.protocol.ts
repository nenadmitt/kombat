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
  setupState: 'battleship:setup-state',
  error: 'battleship:error',
} as const;

/** How long a player has to move before the turn times out. */
export const TURN_SECONDS = 30;
/** Total turn timeouts a player may accrue before forfeiting the match. */
export const MAX_TIMEOUTS = 3;
/** How long both players have to deploy their fleets before auto-forfeiting. */
export const SETUP_SECONDS = 90;

/**
 * Why a match ended: every enemy ship sunk, an explicit forfeit, too many turn
 * timeouts, or a fleet never deployed in time.
 */
export type BattleshipEndReason =
  | 'complete'
  | 'forfeit'
  | 'timeout'
  | 'setup-timeout';

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
  /** Null only when neither player deployed in time (match voided). */
  winnerUserId: string | null;
  reason: 'forfeit' | 'setup-timeout';
};

// --- server -> caller only ----------------------------------------------------

/** Sent to a player on entering while the match is still in setup, so the
 *  auto-forfeit countdown doesn't depend on the REST snapshot alone. */
export type SetupStatePayload = {
  /** Epoch ms when fleet setup auto-forfeits. */
  setupDeadline: number;
};

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
  /** Epoch ms when fleet setup auto-forfeits (null once play begins). */
  setupDeadline: number | null;
  /** Accrued turn-timeout counts per user. */
  timeouts: Record<string, number>;
  /** Socket connection state per user. */
  online: Record<string, boolean>;
  winnerUserId: string | null;
  /** Why the match ended (null while still in progress). */
  endReason: BattleshipEndReason | null;
  opponentUserId: string;
};
