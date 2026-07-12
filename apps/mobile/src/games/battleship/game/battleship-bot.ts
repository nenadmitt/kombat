import {
  bombCells,
  type FleetPlacements,
  GRID,
  POINTS_PER_HIT,
  POWERUP_COST,
  resolveShot,
  type Shot,
  shipAt,
  sunkShipIds,
} from '@gaming-platform/core';

/** How the bot decided to aim: chasing a wounded ship vs. searching. */
type AimMode = 'hunt' | 'target';

type Aim = { row: number; col: number; mode: AimMode };

/** A resolved bot move: the aim, the weapon, and the cells it newly struck. */
export type BotMove = {
  kind: 'single' | 'bomb';
  row: number;
  col: number;
  cells: Shot[];
};

const inBounds = (row: number, col: number) =>
  row >= 0 && row < GRID && col >= 0 && col < GRID;

/** Orthogonal, in-bounds neighbors of a cell. */
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

/**
 * Hunt-and-target aim. While a hit ship is still afloat the bot chases it: once
 * two hits reveal the ship's axis it presses both ends of the line, otherwise
 * it probes the four neighbors of a lone hit. With no live hit it hunts on a
 * checkerboard (the smallest ship spans two cells, so every ship must touch a
 * parity cell). Returns null only when the board is exhausted.
 */
function chooseAim(fleet: FleetPlacements, shots: Shot[]): Aim | null {
  const fired = new Set(shots.map(s => `${s.row},${s.col}`));
  const isOpen = (row: number, col: number) =>
    inBounds(row, col) && !fired.has(`${row},${col}`);

  const sunk = sunkShipIds(fleet, shots);
  // Hits on ships that haven't been sunk yet - the trail worth following.
  const activeHits = shots.filter(
    s => s.result === 'hit' && !sunk.has(shipAt(s.row, s.col, fleet)!),
  );

  if (activeHits.length > 0) {
    // Two hits sharing a row (or column) reveal the ship's axis - extend it.
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
    // Lone hit(s): probe any open orthogonal neighbor.
    const probes = activeHits
      .flatMap(h => orthoNeighbors(h.row, h.col))
      .filter(c => isOpen(c.row, c.col));
    if (probes.length) return { ...pickRandom(probes), mode: 'target' };
  }

  // Hunt: prefer checkerboard cells, fall back to any remaining open cell.
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

/**
 * The single-player demo opponent. It has full knowledge of the player's fleet
 * (this is a local bot, not a networked player) and resolves its own shots.
 * It hunts for ships, chases the ones it wounds, and spends its charge on a
 * bomb to finish a wounded ship once it can afford one.
 */
export class BattleshipBot {
  /** Charge earned from hits; never shown, spent on power-ups. */
  private points = 0;

  /**
   * Decide and resolve the bot's next shot against `fleet`, given the shots it
   * has already fired. Returns the newly struck cells (with results) and the
   * weapon used, or null when the board is exhausted. Updates internal charge.
   */
  decideMove(fleet: FleetPlacements, priorShots: Shot[]): BotMove | null {
    const aim = chooseAim(fleet, priorShots);
    if (!aim) {
      return null;
    }

    // Spend a power-up to press an advantage: once charged, a bomb dropped on a
    // wounded ship tends to finish it and expose its neighbors.
    const usePower = aim.mode === 'target' && this.points >= POWERUP_COST;
    const resolved = usePower
      ? bombCells(aim.row, aim.col, fleet)
      : [
          {
            row: aim.row,
            col: aim.col,
            result: resolveShot(aim.row, aim.col, fleet),
          },
        ];

    const fired = new Set(priorShots.map(s => `${s.row},${s.col}`));
    const cells = resolved.filter(s => !fired.has(`${s.row},${s.col}`));
    if (cells.length === 0) {
      return null;
    }

    if (usePower) {
      this.points -= POWERUP_COST;
    }
    this.points += cells.filter(s => s.result === 'hit').length * POINTS_PER_HIT;

    return { kind: usePower ? 'bomb' : 'single', row: aim.row, col: aim.col, cells };
  }

  /** Clear the bot's charge for a fresh match. */
  reset() {
    this.points = 0;
  }
}
