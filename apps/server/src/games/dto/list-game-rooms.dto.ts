import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class ListGameRoomsDto {
  /** When true, rooms created by the requesting user are left out of the list. */
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  excludeOwn?: boolean;
}
