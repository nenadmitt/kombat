import type {
  Cell,
  FireKind,
  FleetPlacements,
  MinePlacement,
  Orientation,
  Placement,
  PowerupKind,
  ShipSpec,
  Shot,
  ShotResult,
} from './battleship.types';

export const GRID = 10;

export const FLEET: ShipSpec[] = [
  { id: 'carrier', label: 'Carrier', size: 5 },
  { id: 'battleship', label: 'Battleship', size: 4 },
  { id: 'cruiser', label: 'Cruiser', size: 3 },
  { id: 'submarine', label: 'Submarine', size: 3 },
  { id: 'destroyer', label: 'Destroyer', size: 2 },
];

export const SHIP_BY_ID: Record<string, ShipSpec> = Object.fromEntries(
  FLEET.map(s => [s.id, s]),
);

export const MINES_PER_PLAYER = 2;

export const POINTS_PER_HIT = 1;
export const POWERUP_COSTS: Record<PowerupKind, number> = {
  torpedo: 3,
  bomb: 4,
};
export const POWERUP_MAX_USES = 2;
/** Fills the charge bar; points can exceed it. */
export const CHARGE_BAR_MAX = 9;

const BOMB_SIZE = 3;

export function cellsFor(p: Placement, size: number): Cell[] {
  return Array.from({ length: size }, (_, i) => ({
    r: p.orientation === 'v' ? p.row + i : p.row,
    c: p.orientation === 'h' ? p.col + i : p.col,
  }));
}

export function buildOccupied(placements: FleetPlacements): Set<string> {
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

export function mineAt(
  row: number,
  col: number,
  mines: MinePlacement[],
): boolean {
  return mines.some(m => m.row === row && m.col === col);
}

export function resolveShot(
  row: number,
  col: number,
  fleet: FleetPlacements,
  mines: MinePlacement[] = [],
): ShotResult {
  if (mineAt(row, col, mines)) {
    return 'mine';
  }
  return shipAt(row, col, fleet) ? 'hit' : 'miss';
}

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

/** Fires from the left edge and stops at the first ship or mine. */
export function torpedoCells(
  row: number,
  fleet: FleetPlacements,
  mines: MinePlacement[] = [],
): Shot[] {
  const cells: Shot[] = [];
  for (let col = 0; col < GRID; col++) {
    const result = resolveShot(row, col, fleet, mines);
    cells.push({ row, col, result });
    if (result !== 'miss') {
      break;
    }
  }
  return cells;
}

/** Clamped so the 3x3 block stays fully on the board near an edge. */
export function bombCells(
  row: number,
  col: number,
  fleet: FleetPlacements,
  mines: MinePlacement[] = [],
): Shot[] {
  const clamp = (v: number) => Math.max(0, Math.min(v, GRID - BOMB_SIZE));
  const r0 = clamp(row - 1);
  const c0 = clamp(col - 1);
  const cells: Shot[] = [];
  for (let r = r0; r < r0 + BOMB_SIZE; r++) {
    for (let c = c0; c < c0 + BOMB_SIZE; c++) {
      cells.push({ row: r, col: c, result: resolveShot(r, c, fleet, mines) });
    }
  }
  return cells;
}

export function resolveFire(
  kind: FireKind,
  row: number,
  col: number,
  fleet: FleetPlacements,
  mines: MinePlacement[] = [],
): Shot[] {
  return kind === 'single'
    ? [{ row, col, result: resolveShot(row, col, fleet, mines) }]
    : kind === 'torpedo'
      ? torpedoCells(row, fleet, mines)
      : bombCells(row, col, fleet, mines);
}

/** Mirrored onto the victim's board; the victim's own mines don't chain. */
export function mineBlastCells(
  mine: MinePlacement,
  victimFleet: FleetPlacements,
): Shot[] {
  return bombCells(mine.row, mine.col, victimFleet);
}

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

export function isValidMines(
  mines: MinePlacement[],
  placements: FleetPlacements,
): boolean {
  if (mines.length !== MINES_PER_PLAYER) {
    return false;
  }
  const occupied = buildOccupied(placements);
  const seen = new Set<string>();
  for (const { row, col } of mines) {
    const key = `${row},${col}`;
    if (
      !Number.isInteger(row) ||
      !Number.isInteger(col) ||
      row < 0 ||
      row >= GRID ||
      col < 0 ||
      col >= GRID ||
      occupied.has(key) ||
      seen.has(key)
    ) {
      return false;
    }
    seen.add(key);
  }
  return true;
}

export function randomMines(placements: FleetPlacements): MinePlacement[] {
  const occupied = buildOccupied(placements);
  const open: MinePlacement[] = [];
  for (let row = 0; row < GRID; row++) {
    for (let col = 0; col < GRID; col++) {
      if (!occupied.has(`${row},${col}`)) {
        open.push({ row, col });
      }
    }
  }
  const mines: MinePlacement[] = [];
  while (mines.length < MINES_PER_PLAYER && open.length > 0) {
    const idx = Math.floor(Math.random() * open.length);
    mines.push(open.splice(idx, 1)[0]!);
  }
  return mines;
}

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
