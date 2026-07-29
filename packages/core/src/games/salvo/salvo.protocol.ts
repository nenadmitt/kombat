import type {
  SalvoEndReason,
  SalvoImpactKind,
  SalvoPlayerStats,
  SalvoPoint,
  SalvoSide,
} from './salvo.types';

/**
 * Socket event names + payload types shared by the server gateway and the
 * mobile client, so the two sides can't drift.
 *
 * Salvo's protocol is deliberately intent-in / outcome-out. A client never
 * sends a resolved shot, only the aim it wants, because the trajectory is
 * integrated with transcendental maths over thousands of steps and is not
 * bit-identical between Hermes on a device and V8 on the server. The server
 * is the only simulator; clients replay the path it returns.
 */
export const SALVO_EVENTS = {
  // client -> server
  enter: 'salvo:enter',
  move: 'salvo:move',
  fire: 'salvo:fire',
  forfeit: 'salvo:forfeit',
  // server -> game channel
  moved: 'salvo:moved',
  shot: 'salvo:shot',
  turnTimeout: 'salvo:turn-timeout',
  presence: 'salvo:presence',
  ended: 'salvo:ended',
  // server -> caller only
  state: 'salvo:state',
  error: 'salvo:error',
} as const;

/** One tank as the server describes it to both clients. */
export type SalvoSeatState = {
  userId: string;
  side: SalvoSide;
  x: number;
  hp: number;
  /**
   * The aim this tank last *fired*, not what it is currently dialling.
   * Live aim is never broadcast - it would hand the opponent the solution
   * before the shell leaves the barrel.
   */
  angle: number;
  power: number;
  online: boolean;
};

/**
 * Full match snapshot: sent to a player on entering and on reconnect. The
 * terrain heightmap rides along because it is destructible, so a seed alone
 * would not describe the current battlefield.
 */
export type SalvoRoomState = {
  phase: 'play' | 'over';
  terrain: number[];
  seats: SalvoSeatState[];
  turnUserId: string;
  /** Movement left this turn - only meaningful to the player on turn. */
  movesLeft: number;
  wind: number;
  shotNumber: number;
  round: number;
  turnDeadline: number | null;
  winnerUserId: string | null;
  endReason: SalvoEndReason | null;
  stats: Record<string, SalvoPlayerStats>;
};

// --- client -> server payloads ------------------------------------------------

export type SalvoEnterRequest = { roomId: string };

/** Drive toward a column. The server clamps it and bills what was travelled. */
export type SalvoMoveRequest = { roomId: string; toX: number };

/** Fire with this aim. Both fields are re-clamped server-side. */
export type SalvoFireRequest = { roomId: string; angle: number; power: number };

export type SalvoForfeitRequest = { roomId: string };

// --- server -> client payloads ------------------------------------------------

/** A tank finished a drive; clients animate from their last known x. */
export type SalvoMovedPayload = {
  byUserId: string;
  x: number;
  movesLeft: number;
};

/**
 * A resolved shot. `path` is the server's own sampled trajectory, which the
 * client animates verbatim rather than re-simulating.
 */
export type SalvoShotPayload = {
  byUserId: string;
  angle: number;
  power: number;
  path: SalvoPoint[];
  impact: SalvoPoint;
  kind: SalvoImpactKind;
  /** Damage to the opponent, and to the shooter's own hull. */
  damage: number;
  selfDamage: number;
  /** Post-shot HP for both players, keyed by user id. */
  hp: Record<string, number>;
  stats: Record<string, SalvoPlayerStats>;
  /** Set when the ground was cratered, so clients can carve the same hole. */
  crater: SalvoPoint | null;
  nextTurnUserId: string;
  wind: number;
  shotNumber: number;
  round: number;
  turnDeadline: number | null;
  winnerUserId: string | null;
};

/** The turn clock ran out: the idle player's shot is skipped. */
export type SalvoTurnTimeoutPayload = {
  timedOutUserId: string;
  timeouts: number;
  nextTurnUserId: string;
  turnDeadline: number | null;
  winnerUserId: string | null;
};

export type SalvoPresencePayload = { userId: string; online: boolean };

export type SalvoEndedPayload = {
  winnerUserId: string | null;
  reason: SalvoEndReason;
};
