import { IsEnum, IsNumberString } from 'class-validator';
import { StakeAsset } from '@gaming-platform/core';

export class WithdrawFromPotDto {
  @IsEnum(StakeAsset)
  asset: StakeAsset;

  /**
   * Base units (wei-style decimal string). No destination field on purpose:
   * a withdrawal always goes to the caller's own registered wallet, resolved
   * server-side, so a stolen token can't redirect funds.
   */
  @IsNumberString()
  amount: string;
}
