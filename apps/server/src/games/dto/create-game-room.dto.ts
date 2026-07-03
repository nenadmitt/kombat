import { IsEnum } from 'class-validator';

import { GameType } from '../../db/types/game';

export class CreateGameRoomDto {
  @IsEnum(GameType)
  gameType: GameType;
}
