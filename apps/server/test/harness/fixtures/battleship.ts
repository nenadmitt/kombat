import {
  FLEET,
  type FleetPlacements,
  type MinePlacement,
} from '@gaming-platform/core';

/**
 * Every ship laid horizontally from column 0, one per row: carrier on row 0
 * down to destroyer on row 4. Deterministic so a test can fire at exactly the
 * 17 occupied cells and never waste a shot.
 */
export const FIXED_FLEET: FleetPlacements = {
  carrier: { row: 0, col: 0, orientation: 'h' },
  battleship: { row: 1, col: 0, orientation: 'h' },
  cruiser: { row: 2, col: 0, orientation: 'h' },
  submarine: { row: 3, col: 0, orientation: 'h' },
  destroyer: { row: 4, col: 0, orientation: 'h' },
};

/**
 * Parked on row 9, five rows clear of the fleet. Setting off a mine ends the
 * firer's turn even on a hit, which would break the single-turn sweep - so the
 * shot sequence must never reach them.
 */
export const FAR_MINES: MinePlacement[] = [
  { row: 9, col: 0 },
  { row: 9, col: 1 },
];

/** The 17 occupied cells, ordered ship by ship. */
export const SHIP_CELLS: { row: number; col: number }[] = FLEET.flatMap(ship => {
  const { row, col } = FIXED_FLEET[ship.id]!;
  return Array.from({ length: ship.size }, (_, i) => ({ row, col: col + i }));
});

/** Open water, clear of both the fleet and the mines. */
export const EMPTY_CELL = { row: 7, col: 7 };
export const EMPTY_CELL_2 = { row: 7, col: 8 };
