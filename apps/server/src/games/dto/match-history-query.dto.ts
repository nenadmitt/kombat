import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Pagination for the History feed - a page of completed matches. */
export class MatchHistoryQueryDto {
  /** Page size (default 10, capped so a client cannot pull the whole table). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;

  /** How many rows to skip - the count already loaded on the client. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
