import { IsInt, IsNumber, IsUUID, Max, Min } from 'class-validator';
import {
  SALVO_FIELD_WIDTH,
  SALVO_MAX_ANGLE,
  SALVO_MAX_POWER,
  SALVO_MIN_ANGLE,
  SALVO_MIN_POWER,
} from '@gaming-platform/core';

export class SalvoEnterDto {
  @IsUUID()
  roomId: string;
}

// Only the outer envelope; the match service re-clamps against live positions and the move budget.
export class SalvoMoveDto {
  @IsUUID()
  roomId: string;

  @IsNumber()
  @Min(0)
  @Max(SALVO_FIELD_WIDTH)
  toX: number;
}

export class SalvoFireDto {
  @IsUUID()
  roomId: string;

  @IsNumber()
  @Min(SALVO_MIN_ANGLE)
  @Max(SALVO_MAX_ANGLE)
  angle: number;

  @IsInt()
  @Min(SALVO_MIN_POWER)
  @Max(SALVO_MAX_POWER)
  power: number;
}

export class SalvoForfeitDto {
  @IsUUID()
  roomId: string;
}
