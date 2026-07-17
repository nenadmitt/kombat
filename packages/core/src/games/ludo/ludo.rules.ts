import {
  absoluteTrackIndex,
  HOME_PROGRESS,
  SAFE_TRACK_INDICES,
  TOKENS_PER_PLAYER,
  TRACK_END,
} from './ludo.board';
import type {
  LudoCapture,
  LudoColor,
  LudoProgress,
  LudoTokens,
} from './ludo.types';
import { LUDO_COLORS } from './ludo.types';

/** Room sizing: up to four seats; the creator may start with two or three. */
export const LUDO_MIN_PLAYERS = 2;
export const LUDO_MAX_PLAYERS = 4;

export const DIE_SIDES = 6;

/** Rolling a 6 grants another roll; the third consecutive 6 forfeits the
 *  whole turn instead (classic rule). */
export const MAX_CONSECUTIVE_SIXES = 3;

/** Colors are seated in join order. */
export function colorForSeat(seat: number): LudoColor {
  return LUDO_COLORS[seat]!;
}

/** A fresh token set for the given colors: everything in base. */
export function initialTokens(colors: LudoColor[]): LudoTokens {
  const tokens: LudoTokens = {};
  for (const color of colors) {
    tokens[color] = Array.from({ length: TOKENS_PER_PLAYER }, () => -1);
  }
  return tokens;
}

/**
 * Token indices `color` may legally move with `die`: a 6 releases a token
 * from base onto the (safe) start cell; a token on the path moves forward
 * only if it would not overshoot home (exact roll finishes).
 */
export function legalMoves(
  tokens: LudoTokens,
  color: LudoColor,
  die: number,
): number[] {
  const own = tokens[color] ?? [];
  const moves: number[] = [];
  for (let i = 0; i < own.length; i++) {
    const p = own[i]!;
    if (p === -1 ? die === DIE_SIDES : p + die <= HOME_PROGRESS) {
      if (p !== HOME_PROGRESS) {
        moves.push(i);
      }
    }
  }
  return moves;
}

export type LudoMoveResult = {
  tokens: LudoTokens;
  fromProgress: LudoProgress;
  toProgress: LudoProgress;
  captures: LudoCapture[];
  /** The moved token reached home. */
  finished: boolean;
};

/**
 * Apply a legal move and resolve captures: landing on a non-safe shared-track
 * cell sends every other color's token on that cell back to its base.
 * Pure - returns a new token map. The caller is responsible for only passing
 * moves that `legalMoves` allows.
 */
export function applyMove(
  tokens: LudoTokens,
  color: LudoColor,
  tokenIndex: number,
  die: number,
): LudoMoveResult {
  const fromProgress = tokens[color]![tokenIndex]!;
  const toProgress = fromProgress === -1 ? 0 : fromProgress + die;

  const next: LudoTokens = Object.fromEntries(
    Object.entries(tokens).map(([c, list]) => [c, [...list]]),
  );
  next[color]![tokenIndex] = toProgress;

  const captures: LudoCapture[] = [];
  if (toProgress <= TRACK_END) {
    const landedAbs = absoluteTrackIndex(color, toProgress);
    if (!SAFE_TRACK_INDICES.has(landedAbs)) {
      for (const other of Object.keys(next) as LudoColor[]) {
        if (other === color) {
          continue;
        }
        const list = next[other]!;
        for (let i = 0; i < list.length; i++) {
          const p = list[i]!;
          if (p >= 0 && p <= TRACK_END && absoluteTrackIndex(other, p) === landedAbs) {
            list[i] = -1;
            captures.push({ color: other, tokenIndex: i });
          }
        }
      }
    }
  }

  return {
    tokens: next,
    fromProgress,
    toProgress,
    captures,
    finished: toProgress === HOME_PROGRESS,
  };
}

/** Whether every one of a color's tokens is home. */
export function allTokensHome(tokens: LudoTokens, color: LudoColor): boolean {
  const own = tokens[color];
  return (
    own !== undefined &&
    own.length > 0 &&
    own.every(p => p === HOME_PROGRESS)
  );
}

/** Send a color's tokens back to base (elimination by forfeit/timeouts). */
export function resetTokensToBase(
  tokens: LudoTokens,
  color: LudoColor,
): LudoTokens {
  return {
    ...tokens,
    [color]: (tokens[color] ?? []).map(() => -1),
  };
}

/** The next color still in play, walking turn order from `current`. */
export function nextColorInPlay(
  seatedColors: LudoColor[],
  current: LudoColor,
  eliminated: LudoColor[],
): LudoColor {
  const idx = seatedColors.indexOf(current);
  for (let step = 1; step <= seatedColors.length; step++) {
    const candidate = seatedColors[(idx + step) % seatedColors.length]!;
    if (!eliminated.includes(candidate)) {
      return candidate;
    }
  }
  return current;
}
