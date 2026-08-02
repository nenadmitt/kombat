import { Module } from '@nestjs/common';

import { DbModule } from '../db';
import { EnsSubnameService } from './ens-subname.service';

@Module({
  imports: [DbModule],
  providers: [EnsSubnameService],
  exports: [EnsSubnameService],
})
export class EnsModule {}
