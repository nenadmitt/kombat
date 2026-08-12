import { TRACK_END } from './ludo.board';
import type { LudoColor, LudoProgress, LudoTokens } from './ludo.types';

/** Token indices carrying the Extra Jump buff, for the rest of the match. */
export type LudoJumps = Partial<Record<LudoColor, number[]>>;

/** Teleport drops a pawn on the first square of its own home column. */
export const TELEPORT_TO: LudoProgress = TRACK_END + 1;

export function jumpsFor(jumps: LudoJumps, color: LudoColor): number[] {
  return jumps[color] ?? [];
}

export function hasJump(
  jumps: LudoJumps,
  color: LudoColor,
  tokenIndex: number,
): boolean {
  return (jumps[color] ?? []).includes(tokenIndex);
}

export function addJump(
  jumps: LudoJumps,
  color: LudoColor,
  tokenIndex: number,
): LudoJumps {
  const own = jumps[color] ?? [];
  if (own.includes(tokenIndex)) {
    return jumps;
  }
  return { ...jumps, [color]: [...own, tokenIndex] };
}

export function dropColorJumps(jumps: LudoJumps, color: LudoColor): LudoJumps {
  return Object.fromEntries(
    Object.entries(jumps).filter(([other]) => other !== color),
  ) as LudoJumps;
}

/**
 * How far a token actually travels for a rolled die. The buff only doubles on
 * the shared track: a base release still needs a raw 6, and the home column
 * keeps the raw die so the exact-finish endgame stays reachable.
 */
export function jumpDistance(
  progress: LudoProgress,
  die: number,
  buffed: boolean,
): number {
  return buffed && progress >= 0 && progress <= TRACK_END ? die * 2 : die;
}

/** Own tokens the buff may still be put on: one per pawn, and only where it
 *  can still double something - past the track it never applies again. */
export function jumpableTokens(
  tokens: LudoTokens,
  color: LudoColor,
  jumps: LudoJumps,
): number[] {
  const own = tokens[color] ?? [];
  const buffed = jumps[color] ?? [];
  const out: number[] = [];
  for (let i = 0; i < own.length; i++) {
    if (own[i]! <= TRACK_END && !buffed.includes(i)) {
      out.push(i);
    }
  }
  return out;
}

/** Own tokens teleport may take: on the shared track, and only while the
 *  landing square is free (no self-stacking in the home column). */
export function teleportableTokens(
  tokens: LudoTokens,
  color: LudoColor,
): number[] {
  const own = tokens[color] ?? [];
  if (own.includes(TELEPORT_TO)) {
    return [];
  }
  const out: number[] = [];
  for (let i = 0; i < own.length; i++) {
    const p = own[i]!;
    if (p >= 0 && p <= TRACK_END) {
      out.push(i);
    }
  }
  return out;
}
