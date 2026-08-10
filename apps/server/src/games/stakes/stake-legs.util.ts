import { BadRequestException } from '@nestjs/common';
import {
  STAKE_ASSET_SYMBOLS,
  StakeAsset,
  convertStakeAmount,
  isStableAsset,
} from '@gaming-platform/core';

import { GameRoomEntity } from '../../db/entities/game-room.entity';
import type { StakeLeg } from '../../stake-pot/stake-leg';
import { participantsOf } from '../room.util';

/**
 * Which asset a joiner ends up staking. A stable-staked room takes any
 * stablecoin at 1:1; a KOMBAT room takes KOMBAT only. Free rooms ignore the
 * request, and an absent request always means the room's own token - that is
 * what keeps clients that never send one working.
 */
export function resolveJoinToken(
  room: GameRoomEntity,
  requested: StakeAsset | undefined,
): StakeAsset | null {
  if (room.stakeToken === null) {
    return null;
  }
  if (requested === undefined || requested === room.stakeToken) {
    return room.stakeToken;
  }
  if (!isStableAsset(room.stakeToken) || !isStableAsset(requested)) {
    throw new BadRequestException(
      `This room is staked in ${STAKE_ASSET_SYMBOLS[room.stakeToken]}, so that is what you have to stake.`,
    );
  }
  return requested;
}

/** The asset a seated player actually staked. The creator always stakes the
 *  room's own token; a joiner may have picked another stablecoin. */
export function stakeAssetFor(room: GameRoomEntity, userId: string): StakeAsset {
  const roomToken = room.stakeToken!;
  if (userId === room.userId) {
    return roomToken;
  }
  return room.stakeTokenChoices?.[userId] ?? roomToken;
}

/** Every participant's stake, converted into the asset they chose. */
export function stakeLegsOf(room: GameRoomEntity): StakeLeg[] {
  const roomToken = room.stakeToken!;
  const roomAmount = room.stakeAmount!;
  return participantsOf(room).map(userId => {
    const asset = stakeAssetFor(room, userId);
    return {
      userId,
      asset,
      amount: BigInt(convertStakeAmount(roomAmount, roomToken, asset)),
    };
  });
}
