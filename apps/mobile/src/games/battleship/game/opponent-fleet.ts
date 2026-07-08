import type { FleetPlacements } from '@gaming-platform/core';

// Shot resolution now lives in @gaming-platform/core (shared with the server).
export { resolveShot, shipAt, sunkShipIds } from '@gaming-platform/core';

/**
 * Hardcoded enemy layout for the single-player demo. Non-overlapping and
 * within the 10x10 board; keyed by the same ship ids as the player's fleet.
 */
export const OPPONENT_FLEET: FleetPlacements = {
  battleship: { row: 0, col: 0, orientation: 'h' },
  destroyer: { row: 2, col: 1, orientation: 'h' },
  frigate: { row: 5, col: 6, orientation: 'v' },
  scout: { row: 8, col: 2, orientation: 'h' },
};
