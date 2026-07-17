import { GameType } from '@gaming-platform/core';

import type { RootStackParamList } from '../navigation/types';

/** Which root-stack screen a game type's room transfers its players into. */
export const GAME_TYPE_SCREENS: Record<GameType, keyof RootStackParamList> = {
  [GameType.NavalBattle]: 'Battleship',
  [GameType.Ludo]: 'Ludo',
};
