import { IsEnum, IsNumberString, IsOptional, ValidateIf } from 'class-validator';

import { GameType, StakeAsset } from '../../db/types/game';

export class CreateGameRoomDto {
  @IsEnum(GameType)
  gameType: GameType;

  /** Omit both stake fields for a free game; provide both to stake. */
  @IsOptional()
  @IsEnum(StakeAsset)
  stakeToken?: StakeAsset;

  /** Per-player stake in base units (wei-style decimal string). */
  @ValidateIf(dto => dto.stakeToken !== undefined)
  @IsNumberString()
  stakeAmount?: string;
}
