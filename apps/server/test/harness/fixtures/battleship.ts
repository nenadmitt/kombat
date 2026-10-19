import {
  FLEET,
  type FleetPlacements,
  type MinePlacement,
} from '@gaming-platform/core';

export const FIXED_FLEET: FleetPlacements = {
  carrier: { row: 0, col: 0, orientation: 'h' },
  battleship: { row: 1, col: 0, orientation: 'h' },
  cruiser: { row: 2, col: 0, orientation: 'h' },
  submarine: { row: 3, col: 0, orientation: 'h' },
  destroyer: { row: 4, col: 0, orientation: 'h' },
};

// A mine ends the firer's turn even on a hit, so the shot sequence must never reach them.
export const FAR_MINES: MinePlacement[] = [
  { row: 9, col: 0 },
  { row: 9, col: 1 },
];

export const SHIP_CELLS: { row: number; col: number }[] = FLEET.flatMap(ship => {
  const { row, col } = FIXED_FLEET[ship.id]!;
  return Array.from({ length: ship.size }, (_, i) => ({ row, col: col + i }));
});

export const EMPTY_CELL = { row: 7, col: 7 };
export const EMPTY_CELL_2 = { row: 7, col: 8 };
