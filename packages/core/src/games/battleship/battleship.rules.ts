import type {
  Cell,
  FleetPlacements,
  Orientation,
  Placement,
  ShipSpec,
  Shot,
  ShotResult,
} from './battleship.types';

/** Board is GRID x GRID. */
export const GRID = 10;

/** The standard fleet — shared by every Battleship mode. */
export const FLEET: ShipSpec[] = [
  { id: 'battleship', label: 'Battleship', size: 5 },
  { id: 'destroyer', label: 'Destroyer', size: 4 },
  { id: 'frigate', label: 'Frigate', size: 3 },
  { id: 'scout', label: 'Scout', size: 2 },
];

export const SHIP_BY_ID: Record<string, ShipSpec> = Object.fromEntries(
  FLEET.map(s => [s.id, s]),
);

/** Charge economy: land a hit to earn a point, spend points to fire a power-up. */
export const POINTS_PER_HIT = 1;
export const POWERUP_COST = 3;
/** Points that fill the charge bar completely (it can still hold more). */
export const CHARGE_BAR_MAX = 9;

const BOMB_SIZE = 3;

/** The cells a ship occupies given its anchor placement and size. */
export function cellsFor(p: Placement, size: number): Cell[] {
  return Array.from({ length: size }, (_, i) => ({
    r: p.orientation === 'v' ? p.row + i : p.row,
    c: p.orientation === 'h' ? p.col + i : p.col,
  }));
}

/** All cells occupied by a (partial) fleet, as `"r,c"` keys. */
export function buildOccupied(placements: FleetPlacements): Set<string> {
  const set = new Set<string>();
  for (const [id, p] of Object.entries(placements)) {
    for (const { r, c } of cellsFor(p, SHIP_BY_ID[id]!.size)) {
      set.add(`${r},${c}`);
    }
  }
  return set;
}

/** Whether every cell is in bounds and not already occupied. */
export function canPlace(cells: Cell[], occupied: Set<string>): boolean {
  return cells.every(
    ({ r, c }) =>
      r >= 0 && r < GRID && c >= 0 && c < GRID && !occupied.has(`${r},${c}`),
  );
}

/** A random in-bounds placement for a ship of the given size. */
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

/** `m:ss` countdown formatting. */
export function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** The id of the ship occupying a cell, or null if it's open water. */
export function shipAt(
  row: number,
  col: number,
  fleet: FleetPlacements,
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

/** Resolve a single shot against a fleet. */
export function resolveShot(
  row: number,
  col: number,
  fleet: FleetPlacements,
): ShotResult {
  return shipAt(row, col, fleet) ? 'hit' : 'miss';
}

/** Ids of ships that are fully hit given the shots fired so far. */
export function sunkShipIds(fleet: FleetPlacements, shots: Shot[]): Set<string> {
  const hits = new Set(
    shots.filter(s => s.result === 'hit').map(s => `${s.row},${s.col}`),
  );
  const sunk = new Set<string>();
  for (const [id, placement] of Object.entries(fleet)) {
    const cells = cellsFor(placement, SHIP_BY_ID[id]!.size);
    if (cells.every(c => hits.has(`${c.r},${c.c}`))) {
      sunk.add(id);
    }
  }
  return sunk;
}

/**
 * Torpedo path along a row: it marches from the left edge, missing on open
 * water and stopping the instant it strikes a ship (that cell is a hit). If
 * the row holds no ships, it passes straight through — every cell a miss.
 */
export function torpedoCells(row: number, fleet: FleetPlacements): Shot[] {
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

/**
 * Bomb blast: a 3x3 block centered on (row, col), clamped so it stays fully on
 * the board when detonated near an edge.
 */
export function bombCells(
  row: number,
  col: number,
  fleet: FleetPlacements,
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

/**
 * A complete, legal fleet: every ship in FLEET present exactly once, each
 * in-bounds and non-overlapping. Used to validate an opponent's submitted
 * placement server-side.
 */
export function isValidFleet(placements: FleetPlacements): boolean {
  if (Object.keys(placements).length !== FLEET.length) {
    return false;
  }
  const occupied = new Set<string>();
  for (const ship of FLEET) {
    const p = placements[ship.id];
    if (!p) {
      return false;
    }
    const cells = cellsFor(p, ship.size);
    if (!canPlace(cells, occupied)) {
      return false;
    }
    for (const { r, c } of cells) {
      occupied.add(`${r},${c}`);
    }
  }
  return true;
}

/** A random legal fleet (retries each ship until it fits). */
export function randomFleet(): FleetPlacements {
  let next: FleetPlacements = {};
  for (const ship of FLEET) {
    for (let attempt = 0; attempt < 200; attempt++) {
      const candidate = randomPlacement(ship.size);
      if (canPlace(cellsFor(candidate, ship.size), buildOccupied(next))) {
        next = { ...next, [ship.id]: candidate };
        break;
      }
    }
  }
  return next;
}
