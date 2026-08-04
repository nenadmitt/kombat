import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { EnsModule } from '../ens';
import { UsersController } from './users.controller';
import { UsersLookupController } from './users-lookup.controller';
import { UsersService } from './users.service';

@Module({
  imports: [AuthenticationModule, EnsModule],
  controllers: [UsersController, UsersLookupController],
  providers: [UsersService],
})
export class UsersModule {}
