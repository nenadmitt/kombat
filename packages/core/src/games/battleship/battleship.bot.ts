import {
  GRID,
  POINTS_PER_HIT,
  POWERUP_COSTS,
  POWERUP_MAX_USES,
  bombCells,
  resolveShot,
  shipAt,
  sunkShipIds,
} from './battleship.rules';
import type {
  FleetPlacements,
  MinePlacement,
  Shot,
} from './battleship.types';

type AimMode = 'hunt' | 'target';

export type Aim = { row: number; col: number; mode: AimMode };

export type BotMove = {
  kind: 'single' | 'bomb';
  row: number;
  col: number;
  cells: Shot[];
};

const inBounds = (row: number, col: number) =>
  row >= 0 && row < GRID && col >= 0 && col < GRID;

function orthoNeighbors(row: number, col: number): { row: number; col: number }[] {
  return [
    { row: row - 1, col },
    { row: row + 1, col },
    { row, col: col - 1 },
    { row, col: col + 1 },
  ].filter(c => inBounds(c.row, c.col));
}

function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

export function chooseAim(fleet: FleetPlacements, shots: Shot[]): Aim | null {
  const fired = new Set(shots.map(s => `${s.row},${s.col}`));
  const isOpen = (row: number, col: number) =>
    inBounds(row, col) && !fired.has(`${row},${col}`);

  const sunk = sunkShipIds(fleet, shots);
  const activeHits = shots.filter(
    s => s.result === 'hit' && !sunk.has(shipAt(s.row, s.col, fleet)!),
  );

  if (activeHits.length > 0) {
    for (const a of activeHits) {
      const sameRow = activeHits.filter(h => h.row === a.row);
      if (sameRow.length >= 2) {
        const cols = sameRow.map(h => h.col);
        const ends = [
          { row: a.row, col: Math.min(...cols) - 1 },
          { row: a.row, col: Math.max(...cols) + 1 },
        ].filter(c => isOpen(c.row, c.col));
        if (ends.length) return { ...pickRandom(ends), mode: 'target' };
      }
      const sameCol = activeHits.filter(h => h.col === a.col);
      if (sameCol.length >= 2) {
        const rows = sameCol.map(h => h.row);
        const ends = [
          { row: Math.min(...rows) - 1, col: a.col },
          { row: Math.max(...rows) + 1, col: a.col },
        ].filter(c => isOpen(c.row, c.col));
        if (ends.length) return { ...pickRandom(ends), mode: 'target' };
      }
    }
    const probes = activeHits
      .flatMap(h => orthoNeighbors(h.row, h.col))
      .filter(c => isOpen(c.row, c.col));
    if (probes.length) return { ...pickRandom(probes), mode: 'target' };
  }

  // Every ship spans at least two cells, so checkerboard cells are enough to find them all.
  const open: { row: number; col: number }[] = [];
  const parity: { row: number; col: number }[] = [];
  for (let r = 0; r < GRID; r++) {
    for (let c = 0; c < GRID; c++) {
      if (!isOpen(r, c)) {
        continue;
      }
      const cell = { row: r, col: c };
      open.push(cell);
      if ((r + c) % 2 === 0) {
        parity.push(cell);
      }
    }
  }
  const pool = parity.length ? parity : open;
  return pool.length ? { ...pickRandom(pool), mode: 'hunt' } : null;
}

export class BattleshipBot {
  private points = 0;
  private bombsUsed = 0;

  decideMove(
    fleet: FleetPlacements,
    priorShots: Shot[],
    mines: MinePlacement[] = [],
  ): BotMove | null {
    const aim = chooseAim(fleet, priorShots);
    if (!aim) {
      return null;
    }

    const usePower =
      aim.mode === 'target' &&
      this.points >= POWERUP_COSTS.bomb &&
      this.bombsUsed < POWERUP_MAX_USES;
    const resolved = usePower
      ? bombCells(aim.row, aim.col, fleet, mines)
      : [
          {
            row: aim.row,
            col: aim.col,
            result: resolveShot(aim.row, aim.col, fleet, mines),
          },
        ];

    const fired = new Set(priorShots.map(s => `${s.row},${s.col}`));
    const cells = resolved.filter(s => !fired.has(`${s.row},${s.col}`));
    if (cells.length === 0) {
      return null;
    }

    if (usePower) {
      this.points -= POWERUP_COSTS.bomb;
      this.bombsUsed += 1;
    }
    this.points += cells.filter(s => s.result === 'hit').length * POINTS_PER_HIT;

    return { kind: usePower ? 'bomb' : 'single', row: aim.row, col: aim.col, cells };
  }

  reset() {
    this.points = 0;
    this.bombsUsed = 0;
  }
}
