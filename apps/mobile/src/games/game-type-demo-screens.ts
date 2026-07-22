import { GameType } from '@gaming-platform/core';

import type { RootStackParamList } from '../navigation/types';

/**
 * Which root-stack screen previews a game type's UI from the Demo Games tab.
 * Separate from GAME_TYPE_SCREENS (the real join-flow destination) - this is
 * a no-op preview, not the actual game.
 */
export const GAME_TYPE_DEMO_SCREENS: Record<GameType, keyof RootStackParamList> = {
  [GameType.NavalBattle]: 'BattleshipSetup',
  [GameType.Ludo]: 'LudoSetup',
  [GameType.TripleCut]: 'TripleCutSetup',
  [GameType.ChromaClash]: 'ChromaClashSetup',
};
