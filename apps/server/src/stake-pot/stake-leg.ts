import { StakeAsset } from '@gaming-platform/core';

/** One player's stake in a match, in the asset they chose to stake it in. */
export type StakeLeg = {
  userId: string;
  asset: StakeAsset;
  amount: bigint;
};
