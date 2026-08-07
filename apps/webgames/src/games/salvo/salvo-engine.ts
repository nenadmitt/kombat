import type {
  SalvoDamageKind,
  SalvoEndReason,
  SalvoPlayerStats,
  SalvoPoint,
  SalvoSide,
  SalvoTerrain,
} from '@gaming-platform/core';

/** One tank as the play screen renders it. */
export type SalvoSeatView = {
  side: SalvoSide;
  name: string;
  initial: string;
  isMe: boolean;
  hp: number;
  /** Live column - tanks drive, so this is not the starting position. */
  x: number;
  angle: number;
  power: number;
};

/** A shell currently in the air. */
export type SalvoFlight = {
  shooter: SalvoSide;
  path: SalvoPoint[];
  /** Live shell position along `path`. */
  shell: SalvoPoint;
  /** Bumped once per shot, so the camera can latch on a new flight. */
  id: number;
};

/**
 * The last resolved shot, kept on screen through the following turn so both
 * players can see where the shell went and correct - the design's dashed arc
 * and impact ring.
 */
export type SalvoTrail = {
  shooter: SalvoSide;
  path: SalvoPoint[];
  impact: SalvoPoint;
  /** Bumped once per shot, so the blast animation can latch on a new impact. */
  id: number;
};

/** One hull taking damage from the shot that just landed. */
export type SalvoDamageHit = {
  side: SalvoSide;
  amount: number;
  kind: SalvoDamageKind;
};

/**
 * Damage from the last resolved shot, for the floating "-12" over the hull
 * that took it. Carries an id so the animation latches on a new hit rather
 * than on a value that happens to repeat.
 */
export type SalvoDamageEvent = {
  id: number;
  hits: SalvoDamageHit[];
};

export type SalvoPlayProps = {
  terrain: SalvoTerrain;
  seats: SalvoSeatView[];
  me: SalvoSide;
  /** True on my turn, including while my tank is still rolling. */
  myTurn: boolean;
  /** True only when I may touch the dials and fire - not mid-drive. */
  armed: boolean;
  /** Terrain units of movement left this turn. */
  movesLeft: number;
  /** Signed wind for the round; positive blows rightwards. */
  wind: number;
  /** 1-based, both shown in the design's "SHOT 4 / ROUND 2" pill. */
  shotNumber: number;
  round: number;
  flight: SalvoFlight | null;
  trail: SalvoTrail | null;
  /** Whoever is currently lining up a shot, for the barrel tick marks. */
  aiming: SalvoSide | null;
  /** Damage from the shot that just landed, or null between shots. */
  damage: SalvoDamageEvent | null;
  /**
   * The hull that has just been destroyed. Set the instant HP hits zero and
   * held while the wreck burns, before `result` finally resolves.
   */
  destroyed: SalvoSide | null;
  /** One-line last-event banner ("Direct hit - 34 damage"). */
  notice: string | null;
  turnDeadline: number | null;
  result: 'win' | 'lose' | null;
  resultReason: SalvoEndReason | null;
  stats: Record<SalvoSide, SalvoPlayerStats>;
  onAim: (aim: { angle?: number; power?: number }) => void;
  /** Drive one step; the engine bills the distance actually covered. */
  onMove: (direction: -1 | 1) => void;
  onFire: () => void;
  onTimerExpire: () => void;
};

/**
 * A Salvo engine drives the duel and exposes it as board props. The local bot
 * demo and the multiplayer socket both implement this, so one screen serves
 * both.
 */
export type SalvoEngine = {
  phase: 'waiting' | 'play';
  /** Why the snapshot has not landed yet - shown under the waiting
   *  spinner so a stuck load is never a mute hang. */
  waitingError?: string | null;
  forfeit: () => void;
  playProps: SalvoPlayProps;
};
