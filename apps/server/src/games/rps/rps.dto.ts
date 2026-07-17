import { IsIn, IsUUID } from 'class-validator';
import { RpsMove } from '@gaming-platform/core';

export class RpsEnterDto {
  @IsUUID()
  roomId: string;
}

export class RpsLockDto {
  @IsUUID()
  roomId: string;

  @IsIn(['rock', 'paper', 'scissors'])
  move: RpsMove;
}

export class RpsForfeitDto {
  @IsUUID()
  roomId: string;
}
