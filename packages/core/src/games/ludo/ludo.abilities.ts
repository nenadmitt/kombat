import {
  absoluteTrackIndex,
  HOME_PROGRESS,
  NEUTRAL_STAR_INDICES,
  TRACK_END,
} from './ludo.board';
import type { LudoColor, LudoProgress, LudoTokens } from './ludo.types';

/** Every ability is self-cast on one of the caster's own pawns. */
export type LudoAbilityKind = 'launcher' | 'jump' | 'teleport' | 'shield';

/** Charge is stored in half-points so the economy stays integer. */
export const CHARGE_MAX_HP = 20;

export const ABILITY_COST_HP: Record<LudoAbilityKind, number> = {
  launcher: 8,
  jump: 10,
  teleport: 20,
  shield: 8,
};

export const ABILITY_MAX_USES: Record<LudoAbilityKind, number> = {
  launcher: 2,
  jump: 4,
  teleport: 1,
  shield: 1,
};

/** How far the launcher throws a pawn - fixed, not rolled. */
export const LAUNCH_DISTANCE = 15;

/** A rolled 5 pays half a point, a 6 pays a full one. */
export function chargeHpForRoll(die: number): number {
  if (die === 5) {
    return 1;
  }
  return die === 6 ? 2 : 0;
}

export function addChargeHp(current: number, gain: number): number {
  return Math.min(current + gain, CHARGE_MAX_HP);
}

/** A landing on one of the four neutral stars pays this. */
export const STAR_LANDING_HP = 4;

/** Banking a pawn pays this - the exact-roll finish or a launch that clamps
 *  into home, never a teleport, which only reaches the home column. */
export const HOME_ARRIVAL_HP = 4;

/** Every pawn a move sends back to base pays this. */
export const CAPTURE_HP = 4;

/**
 * Charge a move pays its owner: where the pawn came to rest plus what it
 * knocked off the board. The two landing bonuses are mutually exclusive by
 * geometry (a star is on the shared track, home is past it), and a capture
 * can never coincide with either - a star cell is safe and the home column
 * holds nobody else's pawns.
 */
export function moveBonusHp(
  color: LudoColor,
  toProgress: LudoProgress,
  captureCount = 0,
): number {
  return landingBonusHp(color, toProgress) + captureCount * CAPTURE_HP;
}

/** The landing half on its own: where the pawn came to rest. */
export function landingBonusHp(
  color: LudoColor,
  toProgress: LudoProgress,
): number {
  if (toProgress === HOME_PROGRESS) {
    return HOME_ARRIVAL_HP;
  }
  if (toProgress < 0 || toProgress > TRACK_END) {
    return 0;
  }
  return NEUTRAL_STAR_INDICES.has(absoluteTrackIndex(color, toProgress))
    ? STAR_LANDING_HP
    : 0;
}

export function freshAbilityUses(): Record<LudoAbilityKind, number> {
  return { ...ABILITY_MAX_USES };
}

/** Where a launched token lands, or null when it has no track left to jump. */
export function launcherTarget(
  progress: LudoProgress,
  jump: number,
): LudoProgress | null {
  if (progress < 0 || progress > TRACK_END) {
    return null;
  }
  return Math.min(progress + jump, HOME_PROGRESS);
}

/** Own tokens the launcher may fire: on the shared track, and only while the
 *  landing square is free - no self-stacking, exactly as a normal move. */
export function launchableTokens(
  tokens: LudoTokens,
  color: LudoColor,
): number[] {
  const own = tokens[color] ?? [];
  const out: number[] = [];
  for (let i = 0; i < own.length; i++) {
    const p = own[i]!;
    if (p < 0 || p > TRACK_END) {
      continue;
    }
    const target = launcherTarget(p, LAUNCH_DISTANCE)!;
    const blockedByOwn =
      target !== HOME_PROGRESS &&
      own.some((other, j) => j !== i && other === target);
    if (!blockedByOwn) {
      out.push(i);
    }
  }
  return out;
}

/** Charge as the UI shows it: whole points, one decimal only when odd. */
export function formatChargePoints(hp: number): string {
  return hp % 2 === 0 ? String(hp / 2) : (hp / 2).toFixed(1);
}
