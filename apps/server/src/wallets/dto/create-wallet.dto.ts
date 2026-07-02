import { IsEnum } from 'class-validator';
import { WalletNetwork } from '../../db/types/wallet';

export class CreateWalletDto {
  @IsEnum(WalletNetwork)
  network: WalletNetwork;
}
