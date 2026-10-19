import type { FleetPlacements, MinePlacement } from '@gaming-platform/core';

import type { BattleshipPlayScreenProps } from './BattleshipPlayScreen';

export type EnginePhase = 'setup' | 'waiting' | 'play';

export type EnginePlayProps = Omit<
  BattleshipPlayScreenProps,
  'onExit' | 'onQuit'
>;

export type BattleshipEngine = {
  phase: EnginePhase;
  waitingError?: string | null;
  submitFleet: (placements: FleetPlacements, mines: MinePlacement[]) => void;
  forfeit: () => void;
  setupDeadline: number | null;
  playProps: EnginePlayProps;
};
