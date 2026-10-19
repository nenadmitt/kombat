import { StakeAsset } from '@gaming-platform/core';

export type StakeLeg = {
  userId: string;
  asset: StakeAsset;
  amount: bigint;
};
