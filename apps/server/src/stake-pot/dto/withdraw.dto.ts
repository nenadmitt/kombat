import { IsEnum, IsNumberString } from 'class-validator';
import { StakeAsset } from '@gaming-platform/core';

export class WithdrawFromPotDto {
  @IsEnum(StakeAsset)
  asset: StakeAsset;

  // No destination field on purpose: payouts always go to the caller's own wallet.
  @IsNumberString()
  amount: string;
}
