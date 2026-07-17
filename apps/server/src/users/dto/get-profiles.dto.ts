import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class GetProfilesDto {
  /** Comma-separated user ids in the query string (?ids=a,b,c). */
  @Transform(({ value }) =>
    typeof value === 'string'
      ? value
          .split(',')
          .map(id => id.trim())
          .filter(Boolean)
      : value,
  )
  @IsArray()
  @ArrayNotEmpty()
  // A match roster is at most a handful; the cap just blocks abuse.
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ids: string[];
}
