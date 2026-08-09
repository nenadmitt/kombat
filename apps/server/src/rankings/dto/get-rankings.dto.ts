import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';

import { GameType } from '../../db/types/game';

export class GetRankingsDto {
  /** Omit for the general (all games) ranking. */
  @IsOptional()
  @Type(() => Number)
  @IsEnum(GameType)
  gameType?: GameType;

  /** Page size (default 50, capped so a client cannot pull the whole table). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** How many rows to skip - the count already loaded on the client. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
