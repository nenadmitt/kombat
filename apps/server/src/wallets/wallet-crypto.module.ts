import { Module } from '@nestjs/common';

import { ConfigurationModule } from '../configuration/configuration.module';
import { WalletEncryptionService } from './wallet-encryption.service';

/**
 * Just the key-encryption primitive, split out so both WalletsModule (create/
 * store wallets) and ChainModule (sign stakes as players) can use it without
 * a circular module dependency (WalletsModule imports ChainModule for the
 * balances endpoint).
 */
@Module({
  imports: [ConfigurationModule],
  providers: [WalletEncryptionService],
  exports: [WalletEncryptionService],
})
export class WalletCryptoModule {}
