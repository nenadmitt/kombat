import type {
  BattleshipEndReason,
  FireKind,
  FleetPlacements,
  MinePlacement,
  PowerupKind,
  Placement,
  Shot,
  VolleyStats,
} from '@gaming-platform/core';

/** A ship positioned on a board, with the colour it renders in. */
export type PlacedShip = {
  id: string;
  size: number;
  color: string;
  placement: Placement;
};

/**
 * One resolved action to animate. `id` bumps on every action so a repeat of
 * the same cells still re-triggers the animation.
 */
export type GridAction = {
  id: number;
  kind: 'single' | 'torpedo' | 'bomb' | 'mine';
  cells: Shot[];
};

export type BattleshipPlayProps = {
  myFleet: PlacedShip[];
  myMines: MinePlacement[];
  myShots: Shot[];
  opponentShots: Shot[];
  revealedEnemyShips: PlacedShip[];
  points: number;
  powerupsUsed: Record<PowerupKind, number>;
  volleys: VolleyStats;
  myTurn: boolean;
  /** The latest action on the enemy board (mine blasts land on mine). */
  action: GridAction | null;
  /** The latest action on my own board. */
  opponentAction: GridAction | null;
  opponent: { initial: string; name: string };
  sunkByMe: number;
  sunkByOpponent: number;
  turnDeadline: number | null;
  myOnline: boolean;
  opponentOnline: boolean;
  result: 'win' | 'lose' | null;
  resultReason: BattleshipEndReason | null;
  onFire: (kind: FireKind, row: number, col: number) => void;
  /** Only the demo enforces its own clock; multiplayer leaves this unset. */
  onTimerExpire?: () => void;
};

export type EnginePhase = 'setup' | 'waiting' | 'play';

/**
 * A Battleship engine drives the match and exposes it as board props. The
 * local bot demo and the multiplayer socket both implement this, so one set
 * of screens serves both.
 */
export type BattleshipEngine = {
  phase: EnginePhase;
  /** Why the snapshot has not landed yet, so a stuck load is never mute. */
  waitingError?: string | null;
  submitFleet: (placements: FleetPlacements, mines: MinePlacement[]) => void;
  forfeit: () => void;
  /** Epoch ms the fleet must be deployed by, or null outside setup. */
  setupDeadline: number | null;
  playProps: BattleshipPlayProps;
};
