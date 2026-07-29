import type { FleetPlacements, MinePlacement } from '@gaming-platform/core';

import type { BattleshipPlayScreenProps } from './BattleshipPlayScreen';

export type EnginePhase = 'setup' | 'waiting' | 'play';

/** The play-screen props an engine provides; the container adds onExit/onQuit. */
export type EnginePlayProps = Omit<
  BattleshipPlayScreenProps,
  'onExit' | 'onQuit'
>;

/**
 * A Battleship engine drives the game state and exposes it as play-screen
 * props. Both the local demo bot and the multiplayer socket implement this,
 * so `BattleshipGame` and the pure-UI screen don't care which is in use.
 */
export type BattleshipEngine = {
  phase: EnginePhase;
  /** Why the snapshot has not landed yet - surfaced so a stuck load is
   *  never a silent wrong-phase render. */
  waitingError?: string | null;
  /** Called from the setup screen when the player confirms their fleet + mines. */
  submitFleet: (placements: FleetPlacements, mines: MinePlacement[]) => void;
  /** Leave the match early (multiplayer forfeits to the opponent). */
  forfeit: () => void;
  /** Epoch ms fleet setup auto-forfeits (null in demo / once play begins). */
  setupDeadline: number | null;
  playProps: EnginePlayProps;
};
