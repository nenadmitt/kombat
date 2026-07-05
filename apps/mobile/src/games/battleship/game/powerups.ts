import { GRID } from '../setup/ship-placement.constants';
import type { Placement, Shot } from '../setup/ship-placement.types';
import { shipAt } from './opponent-fleet';

export type PowerupKind = 'torpedo' | 'bomb';

/** Charge economy: land a hit to earn a point, spend points to fire a power-up. */
export const POINTS_PER_HIT = 1;
export const POWERUP_COST = 3;
/** Points that fill the charge bar completely (it can still hold more). */
export const CHARGE_BAR_MAX = 9;

/**
 * Torpedo path along a row: it marches from the left edge, missing on open
 * water and stopping the instant it strikes a ship (that cell is a hit). If
 * the row holds no ships, it passes straight through — every cell a miss.
 */
export function torpedoCells(row: number, fleet: Record<string, Placement>): Shot[] {
  const cells: Shot[] = [];
  for (let col = 0; col < GRID; col++) {
    const isShip = shipAt(row, col, fleet) !== null;
    cells.push({ row, col, result: isShip ? 'hit' : 'miss' });
    if (isShip) {
      break;
    }
  }
  return cells;
}

const BOMB_SIZE = 3;

/**
 * Bomb blast: a 3x3 block centered on (row, col), clamped so it stays fully on
 * the board when detonated near an edge.
 */
export function bombCells(
  row: number,
  col: number,
  fleet: Record<string, Placement>,
): Shot[] {
  const clamp = (v: number) => Math.max(0, Math.min(v, GRID - BOMB_SIZE));
  const r0 = clamp(row - 1);
  const c0 = clamp(col - 1);
  const cells: Shot[] = [];
  for (let r = r0; r < r0 + BOMB_SIZE; r++) {
    for (let c = c0; c < c0 + BOMB_SIZE; c++) {
      cells.push({ row: r, col: c, result: shipAt(r, c, fleet) ? 'hit' : 'miss' });
    }
  }
  return cells;
}
