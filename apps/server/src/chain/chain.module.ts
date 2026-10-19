import { Module } from '@nestjs/common';

import { ConfigurationModule } from '../configuration/configuration.module';
import { ChainService } from './chain.service';

@Module({
  imports: [ConfigurationModule],
  providers: [ChainService],
  exports: [ChainService],
})
export class ChainModule {}
