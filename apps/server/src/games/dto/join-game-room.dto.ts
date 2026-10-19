import { STAKEABLE_ASSETS } from '@gaming-platform/core';
import { IsIn, IsOptional } from 'class-validator';

import { StakeAsset } from '../../db/types/game';

export class JoinGameRoomDto {
  // Omit to stake the room's token; a stable-staked room also accepts the other stablecoins.
  @IsOptional()
  @IsIn(STAKEABLE_ASSETS)
  stakeToken?: StakeAsset;
}
