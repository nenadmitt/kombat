import { SHIP_BY_ID } from '../setup/ship-placement.constants';
import type { Placement, Shot, ShotResult } from '../setup/ship-placement.types';
import { cellsFor } from '../setup/ship-placement.utils';

/**
 * Hardcoded enemy layout for the single-player prototype. Non-overlapping and
 * within the 10x10 board; keyed by the same ship ids as the player's fleet.
 */
export const OPPONENT_FLEET: Record<string, Placement> = {
  battleship: { row: 0, col: 0, orientation: 'h' },
  destroyer: { row: 2, col: 1, orientation: 'h' },
  frigate: { row: 5, col: 6, orientation: 'v' },
  scout: { row: 8, col: 2, orientation: 'h' },
};

const cellKey = (row: number, col: number) => `${row},${col}`;

/** Ship id occupying a cell, or null if it's open water. */
export function shipAt(
  row: number,
  col: number,
  fleet: Record<string, Placement>,
): string | null {
  for (const [id, placement] of Object.entries(fleet)) {
    const hit = cellsFor(placement, SHIP_BY_ID[id]!.size).some(
      c => c.r === row && c.c === col,
    );
    if (hit) {
      return id;
    }
  }
  return null;
}

export function resolveShot(
  row: number,
  col: number,
  fleet: Record<string, Placement>,
): ShotResult {
  return shipAt(row, col, fleet) ? 'hit' : 'miss';
}

/** Ids of ships that are fully hit given the shots fired so far. */
export function sunkShipIds(
  fleet: Record<string, Placement>,
  shots: Shot[],
): Set<string> {
  const hits = new Set(
    shots.filter(s => s.result === 'hit').map(s => cellKey(s.row, s.col)),
  );
  const sunk = new Set<string>();
  for (const [id, placement] of Object.entries(fleet)) {
    const cells = cellsFor(placement, SHIP_BY_ID[id]!.size);
    if (cells.every(c => hits.has(cellKey(c.r, c.c)))) {
      sunk.add(id);
    }
  }
  return sunk;
}
