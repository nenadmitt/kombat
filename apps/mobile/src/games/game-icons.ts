import type { ImageSourcePropType } from 'react-native';
import { GameType } from '@gaming-platform/core';

import battleshipIcon from '../../assets/games/battleship-icon.png';

export const GAME_ICONS: Record<GameType, ImageSourcePropType> = {
  [GameType.NavalBattle]: battleshipIcon,
};
