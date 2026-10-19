/** Index doubles as the seat index. */
export enum SalvoSide {
  Left = 0,
  Right = 1,
}

/** `heights[x]` is the surface height above the bottom edge at column `x`. */
export type SalvoTerrain = {
  width: number;
  height: number;
  heights: number[];
};

export type SalvoTank = {
  side: SalvoSide;
  x: number;
  hp: number;
  /** Degrees above horizontal, 0-90. */
  angle: number;
  /** 0-100 dial. */
  power: number;
};

export type SalvoPoint = { x: number; y: number };

export type SalvoImpactKind = 'terrain' | 'tank' | 'out-of-bounds';

export type SalvoDamageKind = 'direct' | 'hull' | 'splash' | 'none';

export type SalvoShot = {
  shooter: SalvoSide;
  path: SalvoPoint[];
  impact: SalvoPoint;
  kind: SalvoImpactKind;
  damage: number;
  damageKind: SalvoDamageKind;
  selfDamage: number;
  hit: boolean;
};

export type SalvoPlayerStats = {
  shots: number;
  hits: number;
  bestHit: number;
  damageByRound: number[];
};

export type SalvoEndReason = 'destroyed' | 'timeout' | 'forfeit';
