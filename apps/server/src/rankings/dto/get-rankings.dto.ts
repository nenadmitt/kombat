import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { GameType } from '../../db/types/game';

export class GetRankingsDto {
  @IsOptional()
  @Type(() => Number)
  @IsEnum(GameType)
  gameType?: GameType;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
