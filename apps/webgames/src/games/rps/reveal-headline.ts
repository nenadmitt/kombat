import { describeOutcome, type RpsMove } from '@gaming-platform/core';

const cap = (move: RpsMove) => move.charAt(0).toUpperCase() + move.slice(1);

// `outcome` is from the local player's view: 1 = I won, -1 = I lost.
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
  if (winnerMove === null) return 'Round decided';
  if (loserMove === null) return `${cap(winnerMove)} wins - no move`;
  return describeOutcome(winnerMove, loserMove);
}
