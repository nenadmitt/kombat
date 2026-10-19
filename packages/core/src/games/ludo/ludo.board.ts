import type { LudoCell, LudoColor, LudoProgress } from './ludo.types';

export const BOARD = 15;

export const TRACK_LENGTH = 52;

/** 51..55 are the home column; HOME_PROGRESS is home. */
export const TRACK_END: LudoProgress = 50;
export const HOME_PROGRESS: LudoProgress = 56;

export const TOKENS_PER_PLAYER = 4;

export const START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
};

export const SAFE_TRACK_INDICES: ReadonlySet<number> = new Set([
  0, 8, 13, 21, 26, 34, 39, 47,
]);

export const NEUTRAL_STAR_INDICES: ReadonlySet<number> = new Set(
  [...SAFE_TRACK_INDICES].filter(
    index => !Object.values(START_OFFSET).includes(index),
  ),
);

const span = (
  from: [number, number],
  to: [number, number],
): LudoCell[] => {
  const cells: LudoCell[] = [];
  const dr = Math.sign(to[0] - from[0]);
  const dc = Math.sign(to[1] - from[1]);
  let [r, c] = from;
  for (;;) {
    cells.push({ row: r, col: c });
    if (r === to[0] && c === to[1]) {
      return cells;
    }
    r += dr;
    c += dc;
  }
};

/** Index 0 is red's start (6,1); walked counter-clockwise around the cross. */
export const TRACK_CELLS: readonly LudoCell[] = [
  ...span([6, 1], [6, 5]),
  ...span([5, 6], [0, 6]),
  { row: 0, col: 7 },
  { row: 0, col: 8 },
  ...span([1, 8], [5, 8]),
  ...span([6, 9], [6, 14]),
  { row: 7, col: 14 },
  { row: 8, col: 14 },
  ...span([8, 13], [8, 9]),
  ...span([9, 8], [14, 8]),
  { row: 14, col: 7 },
  { row: 14, col: 6 },
  ...span([13, 6], [9, 6]),
  ...span([8, 5], [8, 0]),
  { row: 7, col: 0 },
  { row: 6, col: 0 },
];

export const HOME_COLUMN_CELLS: Record<LudoColor, readonly LudoCell[]> = {
  red: span([7, 1], [7, 5]),
  green: span([1, 7], [5, 7]),
  yellow: span([7, 13], [7, 9]),
  blue: span([13, 7], [9, 7]),
};

export const CENTER_CELL: LudoCell = { row: 7, col: 7 };

export const BASE_CORNER: Record<LudoColor, [number, number]> = {
  red: [0, 0],
  green: [0, 9],
  blue: [9, 0],
  yellow: [9, 9],
};

export function absoluteTrackIndex(
  color: LudoColor,
  progress: LudoProgress,
): number {
  return (START_OFFSET[color] + progress) % TRACK_LENGTH;
}

export function cellForProgress(
  color: LudoColor,
  progress: LudoProgress,
): LudoCell | null {
  if (progress < 0 || progress >= HOME_PROGRESS) {
    return null;
  }
  if (progress <= TRACK_END) {
    return TRACK_CELLS[absoluteTrackIndex(color, progress)]!;
  }
  return HOME_COLUMN_CELLS[color][progress - TRACK_END - 1]!;
}
