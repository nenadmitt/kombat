import { Module } from '@nestjs/common';

import { ConfigurationModule } from '../configuration/configuration.module';
import { ChainService } from './chain.service';

/** Wallet-facing chain reads and operator gas top-ups. Cache and Db are global. */
@Module({
  imports: [ConfigurationModule],
  providers: [ChainService],
  exports: [ChainService],
})
export class ChainModule {}
