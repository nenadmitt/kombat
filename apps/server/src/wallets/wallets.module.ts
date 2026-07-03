import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { WalletEncryptionService } from './wallet-encryption.service';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [AuthenticationModule],
  controllers: [WalletsController],
  providers: [WalletsService, WalletEncryptionService],
})
export class WalletsModule {}
