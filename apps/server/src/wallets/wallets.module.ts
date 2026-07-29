import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { ChainModule } from '../chain';
import { StakePotModule } from '../stake-pot';
import { WalletCryptoModule } from './wallet-crypto.module';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [
    AuthenticationModule,
    ChainModule,
    StakePotModule,
    WalletCryptoModule,
  ],
  controllers: [WalletsController],
  providers: [WalletsService],
})
export class WalletsModule {}
