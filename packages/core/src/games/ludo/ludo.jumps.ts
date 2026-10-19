import { TRACK_END } from './ludo.board';
import type { LudoColor, LudoProgress, LudoTokens } from './ludo.types';

export type LudoJumps = Partial<Record<LudoColor, number[]>>;

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

/** Doubles only on the shared track, so the exact-finish endgame stays reachable. */
export function jumpDistance(
  progress: LudoProgress,
  die: number,
  buffed: boolean,
): number {
  return buffed && progress >= 0 && progress <= TRACK_END ? die * 2 : die;
}

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
