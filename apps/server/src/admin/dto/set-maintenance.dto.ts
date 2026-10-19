import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetMaintenanceDto {
  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  message?: string;
}
