import type { RpsMove } from './rps.types';

/** The three moves, in display order. */
export const RPS_MOVES: readonly RpsMove[] = ['rock', 'paper', 'scissors'];

/** Best of five: first to WIN_TARGET decisive rounds takes the match. */
export const BEST_OF = 5;
export const WIN_TARGET = 3;

/** What each move beats. */
const BEATS: Record<RpsMove, RpsMove> = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
};

/** Whether move `a` beats move `b`. */
export function beats(a: RpsMove, b: RpsMove): boolean {
  return BEATS[a] === b;
}

/**
 * Resolve a round: 1 = `a` wins, -1 = `b` wins, 0 = tie. A null move (never
 * locked in) loses to any real move; two nulls tie.
 */
export function resolveRound(
  a: RpsMove | null,
  b: RpsMove | null,
): 1 | -1 | 0 {
  if (a === b) {
    return 0;
  }
  if (a === null) {
    return -1;
  }
  if (b === null) {
    return 1;
  }
  return beats(a, b) ? 1 : -1;
}

/** Headline for a decided round, e.g. "Scissors cuts Paper". */
export function describeOutcome(winner: RpsMove, loser: RpsMove): string {
  const verb =
    winner === 'rock' ? 'crushes' : winner === 'paper' ? 'covers' : 'cuts';
  const cap = (m: RpsMove) => m.charAt(0).toUpperCase() + m.slice(1);
  return `${cap(winner)} ${verb} ${cap(loser)}`;
}

/**
 * The demo bot: a uniformly random move. Simple and fair - a demo opponent to
 * practice against, not one to beat. (Also handy as a tie-break flourish.)
 */
export function randomMove(): RpsMove {
  return RPS_MOVES[Math.floor(Math.random() * RPS_MOVES.length)]!;
}
