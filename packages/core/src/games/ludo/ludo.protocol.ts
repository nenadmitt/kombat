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

export const LUDO_EVENTS = {
  enter: 'ludo:enter',
  roll: 'ludo:roll',
  move: 'ludo:move',
  forfeit: 'ludo:forfeit',
  launch: 'ludo:launch',
  jump: 'ludo:jump',
  teleport: 'ludo:teleport',
  shield: 'ludo:shield',
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
  abilityState: 'ludo:ability-state',
  error: 'ludo:error',
} as const;

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

export type LudoRolledPayload = {
  byUserId: string;
  die: number;
  sixChain: number;
  movableTokens: number[];
  thirdSix: boolean;
  stage: LudoStage;
  nextTurnUserId: string;
  turnDeadline: number;
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
  captureCounts: Record<string, number>;
  /** Authoritative: clients replace their token map, not replay the move. */
  tokens: LudoTokens;
  extraRoll: boolean;
  chargeHp: Record<string, number>;
  stage: LudoStage;
  nextTurnUserId: string;
  turnDeadline: number;
  winnerUserId: string | null;
};

/** An ability may be cast with a die pending, so the movable set is re-derived. */
export type LudoAbilityTurn = {
  stage: LudoStage;
  movableTokens: number[];
  nextTurnUserId: string;
  turnDeadline: number;
};

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

export type LudoJumpedPayload = {
  byUserId: string;
  color: LudoColor;
  tokenIndex: number;
  chargeHp: Record<string, number>;
  jumps: LudoJumps;
  turn: LudoAbilityTurn;
};

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

export type LudoShieldedPayload = {
  byUserId: string;
  color: LudoColor;
  tokenIndex: number;
  chargeHp: Record<string, number>;
  shields: LudoShields;
  turn: LudoAbilityTurn;
};

export type LudoAbilityStatePayload = {
  chargeHp: number;
  usesLeft: Record<LudoAbilityKind, number>;
};

export type LudoTurnTimeoutPayload = {
  timedOutUserId: string;
  timeouts: Record<string, number>;
  eliminatedColor: LudoColor | null;
  tokens: LudoTokens;
  jumps: LudoJumps;
  shields: LudoShields;
  nextTurnUserId: string;
  turnDeadline: number;
  winnerUserId: string | null;
};

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

export type LudoPhase = 'play' | 'over';

export type LudoRoomState = {
  roomId: string;
  phase: LudoPhase;
  players: LudoPlayer[];
  tokens: LudoTokens;
  turnUserId: string | null;
  stage: LudoStage;
  die: number | null;
  sixChain: number;
  movableTokens: number[];
  eliminated: LudoColor[];
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  captureCounts: Record<string, number>;
  winnerUserId: string | null;
  endReason: LudoEndReason | null;
  turnDeadline: number | null;
  chargeHp: Record<string, number>;
  jumps: LudoJumps;
  shields: LudoShields;
  abilityUses: Record<LudoAbilityKind, number>;
};
