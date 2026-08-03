import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

const SEMVER = /^\d+\.\d+\.\d+$/;

class UpdateUrlsDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  ios?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  android?: string;
}

export class SetAppVersionDto {
  /** Omit (or null) to clear the floor entirely. */
  @IsOptional()
  @Matches(SEMVER, { message: 'minAppVersion must be x.y.z' })
  minAppVersion?: string;

  @IsOptional()
  @Matches(SEMVER, { message: 'latestAppVersion must be x.y.z' })
  latestAppVersion?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  updateMessage?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  updateNotes?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(30)
  updateSizeLabel?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateUrlsDto)
  updateUrls?: UpdateUrlsDto;
}
