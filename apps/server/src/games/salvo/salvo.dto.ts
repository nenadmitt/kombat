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

/**
 * Drive toward a column. Bounded to the field here; the match service still
 * re-clamps against the live positions and the turn's movement budget, so
 * this is only the outer envelope.
 */
export class SalvoMoveDto {
  @IsUUID()
  roomId: string;

  @IsNumber()
  @Min(0)
  @Max(SALVO_FIELD_WIDTH)
  toX: number;
}

/** Aim to fire with. Re-clamped server-side before the shot is simulated. */
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
