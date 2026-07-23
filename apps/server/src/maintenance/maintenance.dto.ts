import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetMaintenanceDto {
  @IsBoolean()
  enabled: boolean;

  /** Optional banner copy shown in clients instead of the default. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
