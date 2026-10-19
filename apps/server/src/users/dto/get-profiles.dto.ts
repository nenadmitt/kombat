import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsUUID } from 'class-validator';

export class GetProfilesDto {
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
  @ArrayMaxSize(50)
  @IsUUID('all', { each: true })
  ids: string[];
}
