import { STAKEABLE_ASSETS } from '@gaming-platform/core';
import { IsIn, IsOptional } from 'class-validator';

import { StakeAsset } from '../../db/types/game';

export class JoinGameRoomDto {
  /** Omit to stake whatever the room was opened in; a stable-staked room also
   *  accepts either of the other two stablecoins. */
  @IsOptional()
  @IsIn(STAKEABLE_ASSETS)
  stakeToken?: StakeAsset;
}
