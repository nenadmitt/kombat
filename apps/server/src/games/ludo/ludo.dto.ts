import { IsInt, IsUUID, Max, Min } from 'class-validator';
import { TOKENS_PER_PLAYER } from '@gaming-platform/core';

export class LudoEnterDto {
  @IsUUID()
  roomId: string;
}

export class LudoRollDto {
  @IsUUID()
  roomId: string;
}

export class LudoMoveDto {
  @IsUUID()
  roomId: string;

  @IsInt()
  @Min(0)
  @Max(TOKENS_PER_PLAYER - 1)
  tokenIndex: number;
}

export class LudoForfeitDto {
  @IsUUID()
  roomId: string;
}

export class LudoLaunchDto {
  @IsUUID()
  roomId: string;

  @IsInt()
  @Min(0)
  @Max(TOKENS_PER_PLAYER - 1)
  tokenIndex: number;
}

export class LudoJumpDto {
  @IsUUID()
  roomId: string;

  @IsInt()
  @Min(0)
  @Max(TOKENS_PER_PLAYER - 1)
  tokenIndex: number;
}

export class LudoTeleportDto {
  @IsUUID()
  roomId: string;

  @IsInt()
  @Min(0)
  @Max(TOKENS_PER_PLAYER - 1)
  tokenIndex: number;
}

export class LudoShieldDto {
  @IsUUID()
  roomId: string;

  @IsInt()
  @Min(0)
  @Max(TOKENS_PER_PLAYER - 1)
  tokenIndex: number;
}
