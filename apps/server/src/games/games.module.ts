import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';

@Module({
  imports: [AuthenticationModule],
  controllers: [GamesController],
  providers: [GamesService],
})
export class GamesModule {}
