import type {
  FireKind,
  FleetPlacements,
  MinePlacement,
  Placement,
  PowerupKind,
  Shot,
  VolleyStats,
} from './battleship.types';

export type { FireKind } from './battleship.types';

export const BATTLESHIP_EVENTS = {
  enter: 'battleship:enter',
  ready: 'battleship:ready',
  fire: 'battleship:fire',
  forfeit: 'battleship:forfeit',
  opponentReady: 'battleship:opponent-ready',
  start: 'battleship:start',
  shot: 'battleship:shot',
  turnTimeout: 'battleship:turn-timeout',
  presence: 'battleship:presence',
  ended: 'battleship:ended',
  setupState: 'battleship:setup-state',
  error: 'battleship:error',
} as const;

export { MAX_TIMEOUTS, TURN_SECONDS } from '../turn-based';
export const SETUP_SECONDS = 90;

export type BattleshipEndReason =
  | 'complete'
  | 'forfeit'
  | 'timeout'
  | 'setup-timeout';

export type RevealedShip = {
  id: string;
  size: number;
  placement: Placement;
};

export type EnterPayload = {
  roomId: string;
};

export type ReadyPayload = {
  roomId: string;
  placements: FleetPlacements;
  mines: MinePlacement[];
};

export type FirePayload = {
  roomId: string;
  kind: FireKind;
  row: number;
  col: number;
};

export type ForfeitPayload = {
  roomId: string;
};

export type OpponentReadyPayload = {
  userId: string;
};

export type StartPayload = {
  firstTurnUserId: string;
  turnDeadline: number;
};

/** A mine set off by a shot: its blast strikes the FIRER's own board. */
export type MineBlast = {
  center: MinePlacement;
  cells: Shot[];
  sunkShips: RevealedShip[];
};

export type ShotPayload = {
  byUserId: string;
  kind: FireKind;
  cells: Shot[];
  sunkShips: RevealedShip[];
  mineBlasts: MineBlast[];
  points: Record<string, number>;
  powerupsUsed: Record<string, Record<PowerupKind, number>>;
  volleys: Record<string, VolleyStats>;
  nextTurnUserId: string;
  turnDeadline: number;
  winnerUserId: string | null;
};

export type TurnTimeoutPayload = {
  timedOutUserId: string;
  nextTurnUserId: string;
  timeouts: Record<string, number>;
  turnDeadline: number;
  winnerUserId: string | null;
};

export type PresencePayload = {
  userId: string;
  online: boolean;
};

export type EndedPayload = {
  /** Null only when neither player deployed in time (match voided). */
  winnerUserId: string | null;
  reason: 'forfeit' | 'setup-timeout';
};

export type SetupStatePayload = {
  setupDeadline: number;
};

export type BattleshipErrorPayload = {
  message: string;
};

export type BattleshipPhase = 'setup' | 'play' | 'over';

export type BattleshipRoomState = {
  roomId: string;
  phase: BattleshipPhase;
  myFleet: FleetPlacements | null;
  myMines: MinePlacement[] | null;
  opponentReady: boolean;
  /** Mine-triggering cells carry result 'mine'. */
  myShots: Shot[];
  opponentShots: Shot[];
  revealedOpponentShips: RevealedShip[];
  points: Record<string, number>;
  powerupsUsed: Record<string, Record<PowerupKind, number>>;
  volleys: Record<string, VolleyStats>;
  turnUserId: string | null;
  turnDeadline: number | null;
  setupDeadline: number | null;
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  winnerUserId: string | null;
  endReason: BattleshipEndReason | null;
  opponentUserId: string;
};
