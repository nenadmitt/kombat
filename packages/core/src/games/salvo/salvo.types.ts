/**
 * Salvo - the two-tank artillery duel. Both tanks sit on a procedurally
 * generated ridge; players trade shots by dialling an angle and a power until
 * one hull is gone.
 */

/** Which end of the ridge a tank holds. Index doubles as the seat index. */
export enum SalvoSide {
  Left = 0,
  Right = 1,
}

/**
 * The battlefield, in terrain space. `heights[x]` is the surface height above
 * the bottom edge at column `x`, so the array length is the field width and
 * every consumer scales it into whatever pixel box it draws into.
 */
export type SalvoTerrain = {
  width: number;
  height: number;
  heights: number[];
};

/** A tank's fixed column plus the aim it currently holds. */
export type SalvoTank = {
  side: SalvoSide;
  /** Column in terrain space; the tank always rests on `heights[x]`. */
  x: number;
  hp: number;
  /** Barrel elevation in degrees above horizontal, always 0-90. */
  angle: number;
  /** Muzzle velocity as a 0-100 dial. */
  power: number;
};

/** One sampled point of a shell's flight, in terrain space. */
export type SalvoPoint = { x: number; y: number };

/** Why a shell stopped flying. */
export type SalvoImpactKind = 'terrain' | 'tank' | 'out-of-bounds';

/**
 * How a hull took its damage. A shell that strikes armour hurts far more
 * than one that merely lands nearby, and the UI names the difference.
 */
export type SalvoDamageKind = 'direct' | 'hull' | 'splash' | 'none';

/** The resolved outcome of one shot. */
export type SalvoShot = {
  shooter: SalvoSide;
  /** Flight path, ready to draw; empty only if the shell left immediately. */
  path: SalvoPoint[];
  impact: SalvoPoint;
  kind: SalvoImpactKind;
  /** Damage dealt to the opponent (0 on a clean miss). */
  damage: number;
  /** How that damage was taken - drives the banner and the HP popup. */
  damageKind: SalvoDamageKind;
  /** Damage the blast did to the shooter's own tank (a short lob can). */
  selfDamage: number;
  /** True when the shell landed close enough to hurt the opponent at all. */
  hit: boolean;
};

/** Per-player running tally the result screen reports. */
export type SalvoPlayerStats = {
  shots: number;
  hits: number;
  bestHit: number;
  /** Damage dealt per round, index 0 = round 1. */
  damageByRound: number[];
};

export type SalvoEndReason = 'destroyed' | 'timeout' | 'forfeit';
