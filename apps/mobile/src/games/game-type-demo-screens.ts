import { GameType } from '@gaming-platform/core';

import type { RootStackParamList } from '../navigation/types';

export const GAME_TYPE_DEMO_SCREENS: Record<GameType, keyof RootStackParamList> = {
  [GameType.NavalBattle]: 'BattleshipSetup',
  [GameType.Ludo]: 'LudoSetup',
  [GameType.TripleCut]: 'TripleCutSetup',
  [GameType.ChromaClash]: 'ChromaClashSetup',
  [GameType.Salvo]: 'SalvoSetup',
};
