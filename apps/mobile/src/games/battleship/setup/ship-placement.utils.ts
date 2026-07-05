import { GRID, SHIP_BY_ID } from './ship-placement.constants';
import type { Cell, Orientation, Placement } from './ship-placement.types';

export function cellsFor(p: Placement, size: number): Cell[] {
  return Array.from({ length: size }, (_, i) => ({
    r: p.orientation === 'v' ? p.row + i : p.row,
    c: p.orientation === 'h' ? p.col + i : p.col,
  }));
}

export function buildOccupied(placements: Record<string, Placement>): Set<string> {
  const set = new Set<string>();
  for (const [id, p] of Object.entries(placements)) {
    for (const { r, c } of cellsFor(p, SHIP_BY_ID[id]!.size)) {
      set.add(`${r},${c}`);
    }
  }
  return set;
}

export function canPlace(cells: Cell[], occupied: Set<string>): boolean {
  return cells.every(
    ({ r, c }) =>
      r >= 0 && r < GRID && c >= 0 && c < GRID && !occupied.has(`${r},${c}`),
  );
}

export function randomPlacement(size: number): Placement {
  const orientation: Orientation = Math.random() < 0.5 ? 'h' : 'v';
  const maxRow = orientation === 'v' ? GRID - size : GRID - 1;
  const maxCol = orientation === 'h' ? GRID - size : GRID - 1;
  return {
    row: Math.floor(Math.random() * (maxRow + 1)),
    col: Math.floor(Math.random() * (maxCol + 1)),
    orientation,
  };
}

export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
