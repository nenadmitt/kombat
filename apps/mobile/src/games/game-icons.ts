import type { ImageSourcePropType } from 'react-native';
import { GameType } from '@gaming-platform/core';

import battleshipIcon from '../../assets/games/battleship-icon.png';
import ludoIcon from '../../assets/games/ludo-icon.png';
import tripleCutIcon from '../../assets/games/triplecut-icon.png';
import chromaClashIcon from '../../assets/games/chromaclash-icon.png';
import salvoIcon from '../../assets/games/salvo-icon.png';

export const GAME_ICONS: Record<GameType, ImageSourcePropType> = {
  [GameType.NavalBattle]: battleshipIcon,
  [GameType.Ludo]: ludoIcon,
  [GameType.TripleCut]: tripleCutIcon,
  [GameType.ChromaClash]: chromaClashIcon,
  [GameType.Salvo]: salvoIcon,
};
