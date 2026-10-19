import { TRACK_END } from './ludo.board';
import type { LudoColor, LudoTokens } from './ludo.types';

export type LudoShields = Partial<Record<LudoColor, number[]>>;

export function shieldsFor(shields: LudoShields, color: LudoColor): number[] {
  return shields[color] ?? [];
}

export function hasShield(
  shields: LudoShields | undefined,
  color: LudoColor,
  tokenIndex: number,
): boolean {
  return (shields?.[color] ?? []).includes(tokenIndex);
}

export function addShield(
  shields: LudoShields,
  color: LudoColor,
  tokenIndex: number,
): LudoShields {
  const own = shields[color] ?? [];
  if (own.includes(tokenIndex)) {
    return shields;
  }
  return { ...shields, [color]: [...own, tokenIndex] };
}

export function dropColorShields(
  shields: LudoShields,
  color: LudoColor,
): LudoShields {
  return Object.fromEntries(
    Object.entries(shields).filter(([other]) => other !== color),
  ) as LudoShields;
}

export function shieldableTokens(
  tokens: LudoTokens,
  color: LudoColor,
  shields: LudoShields,
): number[] {
  const own = tokens[color] ?? [];
  const shielded = shields[color] ?? [];
  const out: number[] = [];
  for (let i = 0; i < own.length; i++) {
    if (own[i]! <= TRACK_END && !shielded.includes(i)) {
      out.push(i);
    }
  }
  return out;
}
