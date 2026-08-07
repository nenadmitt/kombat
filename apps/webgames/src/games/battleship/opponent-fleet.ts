import type { FleetPlacements, MinePlacement } from '@gaming-platform/core';

/**
 * Hardcoded enemy layout for the single-player demo. Non-overlapping and
 * within the 10x10 board; keyed by the same ship ids as the player's fleet.
 */
export const OPPONENT_FLEET: FleetPlacements = {
  carrier: { row: 0, col: 0, orientation: 'h' },
  battleship: { row: 2, col: 1, orientation: 'h' },
  cruiser: { row: 5, col: 6, orientation: 'v' },
  submarine: { row: 4, col: 1, orientation: 'h' },
  destroyer: { row: 8, col: 2, orientation: 'h' },
};

/** The demo opponent's sea mines - on open water, off every ship above. */
export const OPPONENT_MINES: MinePlacement[] = [
  { row: 3, col: 7 },
  { row: 6, col: 2 },
];
