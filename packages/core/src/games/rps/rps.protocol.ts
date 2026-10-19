import type { RpsEndReason, RpsMove } from './rps.types';

export { MAX_TIMEOUTS, TURN_SECONDS } from '../turn-based';

export const RPS_EVENTS = {
  enter: 'rps:enter',
  lock: 'rps:lock',
  forfeit: 'rps:forfeit',
  locked: 'rps:locked',
  reveal: 'rps:reveal',
  presence: 'rps:presence',
  ended: 'rps:ended',
  error: 'rps:error',
} as const;

export type RpsEnterPayload = {
  roomId: string;
};

export type RpsLockPayload = {
  roomId: string;
  move: RpsMove;
};

export type RpsForfeitPayload = {
  roomId: string;
};

/** Only the fact of locking is broadcast, never the move. */
export type RpsLockedPayload = {
  userId: string;
  bothLocked: boolean;
};

export type RpsRevealPayload = {
  round: number;
  /** null = never locked in. */
  moves: Record<string, RpsMove | null>;
  /** Null on a tie; the round replays. */
  roundWinnerUserId: string | null;
  scores: Record<string, number>;
  timeouts: Record<string, number>;
  nextRound: number;
  nextDeadline: number | null;
  winnerUserId: string | null;
};

export type RpsPresencePayload = {
  userId: string;
  online: boolean;
};

export type RpsEndedPayload = {
  /** Null when the match voided (both players timed out). */
  winnerUserId: string | null;
  reason: RpsEndReason;
};

export type RpsErrorPayload = {
  message: string;
};

export type RpsPhase = 'play' | 'over';

export type RpsRoomState = {
  roomId: string;
  phase: RpsPhase;
  opponentUserId: string;
  round: number;
  scores: Record<string, number>;
  myMove: RpsMove | null;
  opponentLocked: boolean;
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  roundDeadline: number | null;
  winnerUserId: string | null;
  endReason: RpsEndReason | null;
};
