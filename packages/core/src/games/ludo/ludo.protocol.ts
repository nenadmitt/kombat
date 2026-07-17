import type {
  LudoCapture,
  LudoColor,
  LudoEndReason,
  LudoPlayer,
  LudoProgress,
  LudoStage,
  LudoTokens,
} from './ludo.types';

export { MAX_TIMEOUTS, TURN_SECONDS } from '../turn-based';

/**
 * Socket event names + payload types shared by the server gateway and the
 * mobile client, so the two sides can't drift.
 */
export const LUDO_EVENTS = {
  // client -> server
  enter: 'ludo:enter',
  roll: 'ludo:roll',
  move: 'ludo:move',
  forfeit: 'ludo:forfeit',
  // server -> game channel
  rolled: 'ludo:rolled',
  moved: 'ludo:moved',
  turnTimeout: 'ludo:turn-timeout',
  eliminated: 'ludo:eliminated',
  presence: 'ludo:presence',
  ended: 'ludo:ended',
  // server -> caller only
  error: 'ludo:error',
} as const;

// --- client -> server payloads ------------------------------------------------

export type LudoEnterPayload = {
  roomId: string;
};

export type LudoRollPayload = {
  roomId: string;
};

export type LudoMovePayload = {
  roomId: string;
  tokenIndex: number;
};

export type LudoForfeitPayload = {
  roomId: string;
};

// --- server -> game channel payloads -----------------------------------------

export type LudoRolledPayload = {
  byUserId: string;
  die: number;
  /** Consecutive sixes rolled this turn, this roll included. */
  sixChain: number;
  /** Token indices the roller may move (empty when the turn auto-passes). */
  movableTokens: number[];
  /** The third consecutive six forfeits the turn without moving. */
  thirdSix: boolean;
  /** 'move' = roller must now pick a token; 'roll' = next roller's die. */
  stage: LudoStage;
  nextTurnUserId: string;
  /** Epoch ms when the current turn times out. */
  turnDeadline: number;
};

export type LudoMovedPayload = {
  byUserId: string;
  color: LudoColor;
  tokenIndex: number;
  die: number;
  fromProgress: LudoProgress;
  toProgress: LudoProgress;
  captures: LudoCapture[];
  /** Authoritative token map after the move - clients replace, not replay. */
  tokens: LudoTokens;
  /** The roller earned another roll (rolled a six, chain below the cap). */
  extraRoll: boolean;
  stage: LudoStage;
  nextTurnUserId: string;
  turnDeadline: number;
  winnerUserId: string | null;
};

export type LudoTurnTimeoutPayload = {
  timedOutUserId: string;
  /** Accrued timeout counts per user. */
  timeouts: Record<string, number>;
  /** Set when this timeout eliminated the player (MAX_TIMEOUTS reached). */
  eliminatedColor: LudoColor | null;
  /** Token map after any elimination reset. */
  tokens: LudoTokens;
  nextTurnUserId: string;
  turnDeadline: number;
  /** Set when the elimination left only one player standing. */
  winnerUserId: string | null;
};

/** A player forfeited (left) mid-match and was eliminated. */
export type LudoEliminatedPayload = {
  userId: string;
  color: LudoColor;
  tokens: LudoTokens;
  nextTurnUserId: string;
  turnDeadline: number;
  winnerUserId: string | null;
};

export type LudoPresencePayload = {
  userId: string;
  online: boolean;
};

export type LudoEndedPayload = {
  winnerUserId: string;
  reason: LudoEndReason;
};

export type LudoErrorPayload = {
  message: string;
};

// --- REST resume state (same for every participant - Ludo hides nothing) -----

export type LudoPhase = 'play' | 'over';

export type LudoRoomState = {
  roomId: string;
  phase: LudoPhase;
  /** Seats in turn order (creator first). */
  players: LudoPlayer[];
  tokens: LudoTokens;
  turnUserId: string | null;
  stage: LudoStage;
  /** The die awaiting a token choice (stage 'move'), else null. */
  die: number | null;
  sixChain: number;
  /** Movable token indices for the pending die (stage 'move'), else empty. */
  movableTokens: number[];
  eliminated: LudoColor[];
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  winnerUserId: string | null;
  endReason: LudoEndReason | null;
  /** Epoch ms when the current turn times out (null once over). */
  turnDeadline: number | null;
};
