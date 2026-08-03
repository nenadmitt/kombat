import type { RpsEndReason, RpsMove } from './rps.types';

export { MAX_TIMEOUTS, TURN_SECONDS } from '../turn-based';

/**
 * Socket event names + payload types shared by the server gateway and the
 * mobile client, so the two sides can't drift.
 */
export const RPS_EVENTS = {
  // client -> server
  enter: 'rps:enter',
  lock: 'rps:lock',
  forfeit: 'rps:forfeit',
  // server -> game channel
  locked: 'rps:locked',
  reveal: 'rps:reveal',
  presence: 'rps:presence',
  ended: 'rps:ended',
  // server -> caller only
  error: 'rps:error',
} as const;

// --- client -> server payloads ------------------------------------------------

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

// --- server -> game channel payloads -----------------------------------------

/** A player committed their (still-secret) move. Only the fact is broadcast,
 *  never the move itself. */
export type RpsLockedPayload = {
  userId: string;
  /** Whether both players are now locked (reveal follows immediately). */
  bothLocked: boolean;
};

/**
 * A round resolved (both locked, or the deadline forced it). Carries both
 * moves face-up, the round winner, the running score, and the next round's
 * clock - or the match winner when it's over.
 */
export type RpsRevealPayload = {
  round: number;
  /** Revealed moves keyed by userId; null = never locked in. */
  moves: Record<string, RpsMove | null>;
  /** Winner of this round, or null on a tie (round replays). */
  roundWinnerUserId: string | null;
  /** Round-win counts per user after this round. */
  scores: Record<string, number>;
  /** Accrued timeout counts per user. */
  timeouts: Record<string, number>;
  /** The next round's index (unchanged from `round` on a tie replay). */
  nextRound: number;
  /** Epoch ms the next round's lock-in times out (null once the match is over). */
  nextDeadline: number | null;
  /** Set once someone has taken the match. */
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

// --- REST resume state (personalized per requester) --------------------------

export type RpsPhase = 'play' | 'over';

export type RpsRoomState = {
  roomId: string;
  phase: RpsPhase;
  opponentUserId: string;
  round: number;
  /** Round-win counts per user. */
  scores: Record<string, number>;
  /** The requester's locked move for the current round, or null. */
  myMove: RpsMove | null;
  /** Whether the opponent has locked this round (their move stays hidden). */
  opponentLocked: boolean;
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  /** Epoch ms the current round's lock-in times out (null once over). */
  roundDeadline: number | null;
  winnerUserId: string | null;
  endReason: RpsEndReason | null;
};
