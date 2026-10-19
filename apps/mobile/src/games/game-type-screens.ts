import { GameType } from '@gaming-platform/core';

import type { RootStackParamList } from '../navigation/types';

export const GAME_TYPE_SCREENS: Record<GameType, keyof RootStackParamList> = {
  [GameType.NavalBattle]: 'Battleship',
  [GameType.Ludo]: 'Ludo',
  [GameType.TripleCut]: 'TripleCut',
  [GameType.ChromaClash]: 'ChromaClash',
  [GameType.Salvo]: 'Salvo',
};
