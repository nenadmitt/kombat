import type { LudoAbilityKind } from './ludo.abilities';
import type { LudoJumps } from './ludo.jumps';
import type { LudoShields } from './ludo.shields';
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
  launch: 'ludo:launch',
  jump: 'ludo:jump',
  teleport: 'ludo:teleport',
  shield: 'ludo:shield',
  // server -> game channel
  rolled: 'ludo:rolled',
  moved: 'ludo:moved',
  launched: 'ludo:launched',
  jumped: 'ludo:jumped',
  teleported: 'ludo:teleported',
  shielded: 'ludo:shielded',
  turnTimeout: 'ludo:turn-timeout',
  eliminated: 'ludo:eliminated',
  presence: 'ludo:presence',
  ended: 'ludo:ended',
  // server -> caller only
  abilityState: 'ludo:ability-state',
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

export type LudoLaunchPayload = {
  roomId: string;
  tokenIndex: number;
};

export type LudoJumpPayload = {
  roomId: string;
  tokenIndex: number;
};

export type LudoTeleportPayload = {
  roomId: string;
  tokenIndex: number;
};

export type LudoShieldPayload = {
  roomId: string;
  tokenIndex: number;
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
  /** Public charge in half-points, per user. */
  chargeHp: Record<string, number>;
};

export type LudoMovedPayload = {
  byUserId: string;
  color: LudoColor;
  tokenIndex: number;
  die: number;
  fromProgress: LudoProgress;
  toProgress: LudoProgress;
  captures: LudoCapture[];
  /** Running capture totals per user - authoritative, survives reconnect. */
  captureCounts: Record<string, number>;
  /** Authoritative token map after the move - clients replace, not replay. */
  tokens: LudoTokens;
  /** The roller earned another roll (rolled a six, chain below the cap). */
  extraRoll: boolean;
  /** Public charge in half-points, per user - a landing can pay charge. */
  chargeHp: Record<string, number>;
  stage: LudoStage;
  nextTurnUserId: string;
  turnDeadline: number;
  winnerUserId: string | null;
};

/**
 * Where the turn stands once an ability has resolved. An ability may be cast
 * with a die already pending, so the caster's movable set is re-derived and
 * the turn passes when the ability left nothing to move.
 */
export type LudoAbilityTurn = {
  stage: LudoStage;
  /** The caster's movable token indices when a die is still pending. */
  movableTokens: number[];
  nextTurnUserId: string;
  turnDeadline: number;
};

/** The launcher fired: a jump that lands like a normal move. */
export type LudoLaunchedPayload = {
  byUserId: string;
  color: LudoColor;
  tokenIndex: number;
  fromProgress: LudoProgress;
  toProgress: LudoProgress;
  captures: LudoCapture[];
  captureCounts: Record<string, number>;
  tokens: LudoTokens;
  chargeHp: Record<string, number>;
  turn: LudoAbilityTurn;
  winnerUserId: string | null;
};

/** Extra Jump landed on a pawn. Public: the glow is on the board for everyone. */
export type LudoJumpedPayload = {
  byUserId: string;
  color: LudoColor;
  tokenIndex: number;
  chargeHp: Record<string, number>;
  jumps: LudoJumps;
  turn: LudoAbilityTurn;
};

/** A pawn skipped straight to the first square of its home column. */
export type LudoTeleportedPayload = {
  byUserId: string;
  color: LudoColor;
  tokenIndex: number;
  fromProgress: LudoProgress;
  toProgress: LudoProgress;
  tokens: LudoTokens;
  chargeHp: Record<string, number>;
  turn: LudoAbilityTurn;
};

/** A pawn took the permanent shield. Public, like the Extra Jump glow. */
export type LudoShieldedPayload = {
  byUserId: string;
  color: LudoColor;
  tokenIndex: number;
  chargeHp: Record<string, number>;
  shields: LudoShields;
  turn: LudoAbilityTurn;
};

/** Private to the caster: what their bar has left after an ability. */
export type LudoAbilityStatePayload = {
  chargeHp: number;
  usesLeft: Record<LudoAbilityKind, number>;
};

export type LudoTurnTimeoutPayload = {
  timedOutUserId: string;
  /** Accrued timeout counts per user. */
  timeouts: Record<string, number>;
  /** Set when this timeout eliminated the player (MAX_TIMEOUTS reached). */
  eliminatedColor: LudoColor | null;
  /** Token map after any elimination reset. */
  tokens: LudoTokens;
  /** Buffed pawns after any elimination dropped the leaver's. */
  jumps: LudoJumps;
  /** Shielded pawns after any elimination dropped the leaver's. */
  shields: LudoShields;
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
  jumps: LudoJumps;
  shields: LudoShields;
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
  /** Running capture totals per user. */
  captureCounts: Record<string, number>;
  winnerUserId: string | null;
  endReason: LudoEndReason | null;
  /** Epoch ms when the current turn times out (null once over). */
  turnDeadline: number | null;
  /** Public charge in half-points, per user. */
  chargeHp: Record<string, number>;
  /** Buffed pawns of every color - the glow is public. */
  jumps: LudoJumps;
  /** Shielded pawns of every color - the ring is public. */
  shields: LudoShields;
  /** The requesting user's remaining uses. */
  abilityUses: Record<LudoAbilityKind, number>;
};
