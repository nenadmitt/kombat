import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { ChainModule } from '../chain';
import { WebsocketsModule } from '../websockets';
import { BattleshipGateway } from './battleships/battleship.gateway';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { GameDeadlineSweeper } from './game-deadline.sweeper';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { LudoGateway } from './ludo/ludo.gateway';
import { LudoMatchService } from './ludo/ludo-match.service';
import { StakeSweeper } from './stakes/stake.sweeper';
import { StakesService } from './stakes/stakes.service';

@Module({
  imports: [AuthenticationModule, WebsocketsModule, ChainModule],
  controllers: [GamesController],
  providers: [
    GamesService,
    StakesService,
    StakeSweeper,
    BattleshipMatchService,
    BattleshipGateway,
    LudoMatchService,
    LudoGateway,
    GameDeadlineSweeper,
  ],
})
export class GamesModule {}
