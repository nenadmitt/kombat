import type { FleetPlacements, MinePlacement } from '@gaming-platform/core';

export { resolveShot, shipAt, sunkShipIds } from '@gaming-platform/core';

export const OPPONENT_FLEET: FleetPlacements = {
  carrier: { row: 0, col: 0, orientation: 'h' },
  battleship: { row: 2, col: 1, orientation: 'h' },
  cruiser: { row: 5, col: 6, orientation: 'v' },
  submarine: { row: 4, col: 1, orientation: 'h' },
  destroyer: { row: 8, col: 2, orientation: 'h' },
};

export const OPPONENT_MINES: MinePlacement[] = [
  { row: 3, col: 7 },
  { row: 6, col: 2 },
];
