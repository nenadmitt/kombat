import {
  IsBoolean,
  IsEnum,
  IsNumberString,
  IsOptional,
  ValidateIf,
} from 'class-validator';

import { GameType, StakeAsset } from '../../db/types/game';

export class CreateGameRoomDto {
  @IsEnum(GameType)
  gameType: GameType;

  // Omit both stake fields for a free game; provide both to stake.
  @IsOptional()
  @IsEnum(StakeAsset)
  stakeToken?: StakeAsset;

  // Base units, as a decimal string.
  @ValidateIf(dto => dto.stakeToken !== undefined)
  @IsNumberString()
  stakeAmount?: string;

  @IsOptional()
  @IsBoolean()
  isPrivate?: boolean;
}
