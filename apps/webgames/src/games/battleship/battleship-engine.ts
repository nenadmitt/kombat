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

export type PlacedShip = {
  id: string;
  size: number;
  color: string;
  placement: Placement;
};

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
  action: GridAction | null;
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

export type BattleshipEngine = {
  phase: EnginePhase;
  waitingError?: string | null;
  submitFleet: (placements: FleetPlacements, mines: MinePlacement[]) => void;
  forfeit: () => void;
  setupDeadline: number | null;
  playProps: BattleshipPlayProps;
};
