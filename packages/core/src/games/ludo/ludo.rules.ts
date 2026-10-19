import {
  absoluteTrackIndex,
  HOME_PROGRESS,
  SAFE_TRACK_INDICES,
  TOKENS_PER_PLAYER,
  TRACK_END,
} from './ludo.board';
import { jumpDistance } from './ludo.jumps';
import { hasShield, type LudoShields } from './ludo.shields';
import type {
  LudoCapture,
  LudoColor,
  LudoProgress,
  LudoTokens,
} from './ludo.types';
import { LUDO_COLORS } from './ludo.types';

export const LUDO_MIN_PLAYERS = 2;
export const LUDO_MAX_PLAYERS = 4;

export const DIE_SIDES = 6;

/** The third consecutive 6 forfeits the whole turn. */
export const MAX_CONSECUTIVE_SIXES = 3;

export function colorForSeat(seat: number): LudoColor {
  return LUDO_COLORS[seat]!;
}

export function initialTokens(colors: LudoColor[]): LudoTokens {
  const tokens: LudoTokens = {};
  for (const color of colors) {
    tokens[color] = Array.from({ length: TOKENS_PER_PLAYER }, (_, index) =>
      index === 0 ? 0 : -1,
    );
  }
  return tokens;
}

/** No self-stacking: a player's own tokens never share a cell, home excepted. */
export function legalMoves(
  tokens: LudoTokens,
  color: LudoColor,
  die: number,
  jumped: readonly number[] = [],
): number[] {
  const own = tokens[color] ?? [];
  const moves: number[] = [];
  for (let i = 0; i < own.length; i++) {
    const p = own[i]!;
    if (p === HOME_PROGRESS) {
      continue;
    }
    const step = jumpDistance(p, die, jumped.includes(i));
    if (p === -1 ? die !== DIE_SIDES : p + step > HOME_PROGRESS) {
      continue;
    }
    const target = p === -1 ? 0 : p + step;
    const blockedByOwn =
      target !== HOME_PROGRESS &&
      own.some((other, j) => j !== i && other === target);
    if (!blockedByOwn) {
      moves.push(i);
    }
  }
  return moves;
}

export type LudoMoveResult = {
  tokens: LudoTokens;
  fromProgress: LudoProgress;
  toProgress: LudoProgress;
  captures: LudoCapture[];
  finished: boolean;
};

/** A shielded token reads like a safe cell: nothing is captured. */
export function applyMove(
  tokens: LudoTokens,
  color: LudoColor,
  tokenIndex: number,
  die: number,
  shields?: LudoShields,
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
          if (hasShield(shields, other, i)) {
            continue;
          }
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

export function allTokensHome(tokens: LudoTokens, color: LudoColor): boolean {
  const own = tokens[color];
  return (
    own !== undefined &&
    own.length > 0 &&
    own.every(p => p === HOME_PROGRESS)
  );
}

export function resetTokensToBase(
  tokens: LudoTokens,
  color: LudoColor,
): LudoTokens {
  return {
    ...tokens,
    [color]: (tokens[color] ?? []).map(() => -1),
  };
}

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
