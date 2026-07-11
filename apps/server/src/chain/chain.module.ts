import { Module } from '@nestjs/common';

import { ConfigurationModule } from '../configuration/configuration.module';
import { WalletCryptoModule } from '../wallets/wallet-crypto.module';
import { ChainService } from './chain.service';

/**
 * On-chain access (escrow + tokens + signers). Cache and Db modules are
 * global; WalletCryptoModule supplies the key-decryption service used to
 * sign permits / native funding as players.
 */
@Module({
  imports: [ConfigurationModule, WalletCryptoModule],
  providers: [ChainService],
  exports: [ChainService],
})
export class ChainModule {}
