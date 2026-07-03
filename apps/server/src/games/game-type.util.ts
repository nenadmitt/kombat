import { GameType } from '../db/types/game';

/** How many players each game type requires. */
const PLAYER_COUNT_BY_GAME_TYPE: Record<GameType, number> = {
  [GameType.NavalBattle]: 2,
};

export function getPlayerCountForGameType(gameType: GameType): number {
  return PLAYER_COUNT_BY_GAME_TYPE[gameType];
}
