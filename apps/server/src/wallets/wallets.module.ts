import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AuthenticationModule } from '../authentication';
import { WalletEntity } from '../db/entities/wallet.entity';
import { WalletEncryptionService } from './wallet-encryption.service';
import { WalletsController } from './wallets.controller';
import { WalletsService } from './wallets.service';

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity]), AuthenticationModule],
  controllers: [WalletsController],
  providers: [WalletsService, WalletEncryptionService],
})
export class WalletsModule {}
