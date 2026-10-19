import type {
  SalvoDamageKind,
  SalvoEndReason,
  SalvoImpactKind,
  SalvoPlayerStats,
  SalvoPoint,
  SalvoSide,
} from './salvo.types';

// Intent in, outcome out: trajectories aren't bit-identical between Hermes and V8, so only the server simulates.
export const SALVO_EVENTS = {
  enter: 'salvo:enter',
  move: 'salvo:move',
  fire: 'salvo:fire',
  forfeit: 'salvo:forfeit',
  moved: 'salvo:moved',
  shot: 'salvo:shot',
  turnTimeout: 'salvo:turn-timeout',
  presence: 'salvo:presence',
  ended: 'salvo:ended',
  state: 'salvo:state',
  error: 'salvo:error',
} as const;

export type SalvoSeatState = {
  userId: string;
  side: SalvoSide;
  x: number;
  hp: number;
  /** The aim last fired; live aim is never broadcast. */
  angle: number;
  power: number;
  online: boolean;
};

/** Terrain rides along because it is destructible. */
export type SalvoRoomState = {
  phase: 'play' | 'over';
  terrain: number[];
  seats: SalvoSeatState[];
  turnUserId: string;
  movesLeft: number;
  wind: number;
  shotNumber: number;
  round: number;
  turnDeadline: number | null;
  winnerUserId: string | null;
  endReason: SalvoEndReason | null;
  stats: Record<string, SalvoPlayerStats>;
};

export type SalvoEnterRequest = { roomId: string };

export type SalvoMoveRequest = { roomId: string; toX: number };

export type SalvoFireRequest = { roomId: string; angle: number; power: number };

export type SalvoForfeitRequest = { roomId: string };

export type SalvoMovedPayload = {
  byUserId: string;
  x: number;
  movesLeft: number;
};

export type SalvoShotPayload = {
  byUserId: string;
  angle: number;
  power: number;
  path: SalvoPoint[];
  impact: SalvoPoint;
  kind: SalvoImpactKind;
  damage: number;
  damageKind: SalvoDamageKind;
  selfDamage: number;
  hp: Record<string, number>;
  stats: Record<string, SalvoPlayerStats>;
  crater: SalvoPoint | null;
  nextTurnUserId: string;
  wind: number;
  shotNumber: number;
  round: number;
  turnDeadline: number | null;
  winnerUserId: string | null;
};

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
