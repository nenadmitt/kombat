import type { RpsMove } from './rps.types';

export const RPS_MOVES: readonly RpsMove[] = ['rock', 'paper', 'scissors'];

export const BEST_OF = 5;
export const WIN_TARGET = 3;

const BEATS: Record<RpsMove, RpsMove> = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
};

export function beats(a: RpsMove, b: RpsMove): boolean {
  return BEATS[a] === b;
}

/** 1 = `a` wins, -1 = `b` wins, 0 = tie; a null move loses to any real move. */
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

export function describeOutcome(winner: RpsMove, loser: RpsMove): string {
  const verb =
    winner === 'rock' ? 'crushes' : winner === 'paper' ? 'covers' : 'cuts';
  const cap = (m: RpsMove) => m.charAt(0).toUpperCase() + m.slice(1);
  return `${cap(winner)} ${verb} ${cap(loser)}`;
}

export function randomMove(): RpsMove {
  return RPS_MOVES[Math.floor(Math.random() * RPS_MOVES.length)]!;
}
