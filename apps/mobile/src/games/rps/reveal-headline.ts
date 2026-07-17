import { describeOutcome, type RpsMove } from '@gaming-platform/core';

const cap = (m: RpsMove) => m.charAt(0).toUpperCase() + m.slice(1);

/**
 * Reveal headline for a resolved round, guarding the no-show cases that
 * `describeOutcome` (which needs two real moves) can't take: a tie, a
 * double no-show, or a decisive round a player timed out of.
 *
 * `outcome` is from the local player's perspective: 1 = I won, -1 = I lost.
 */
export function revealHeadline(
  mine: RpsMove | null,
  theirs: RpsMove | null,
  outcome: 1 | -1 | 0,
): string {
  if (outcome === 0) {
    return mine ? `Both picked ${cap(mine)}` : 'No moves - round replays';
  }
  const winnerMove = outcome === 1 ? mine : theirs;
  const loserMove = outcome === 1 ? theirs : mine;
  if (winnerMove === null) {
    // Can't happen (a null move never wins), but keep the types honest.
    return 'Round decided';
  }
  if (loserMove === null) {
    return `${cap(winnerMove)} wins - no move`;
  }
  return describeOutcome(winnerMove, loserMove);
}
