import { Module } from '@nestjs/common';

import { AuthenticationModule } from '../authentication';
import { ChainModule } from '../chain';
import { MaintenanceModule } from '../maintenance';
import { WebsocketsModule } from '../websockets';
import { BattleshipGateway } from './battleships/battleship.gateway';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { ChromaGateway } from './chroma/chroma.gateway';
import { ChromaMatchService } from './chroma/chroma-match.service';
import { SalvoGateway } from './salvo/salvo.gateway';
import { SalvoMatchService } from './salvo/salvo-match.service';
import { GameDeadlineSweeper } from './game-deadline.sweeper';
import { GamesController } from './games.controller';
import { GamesService } from './games.service';
import { LudoGateway } from './ludo/ludo.gateway';
import { LudoMatchService } from './ludo/ludo-match.service';
import { RpsGateway } from './rps/rps.gateway';
import { RpsMatchService } from './rps/rps-match.service';
import { StakeSweeper } from './stakes/stake.sweeper';
import { StakesService } from './stakes/stakes.service';

@Module({
  imports: [AuthenticationModule, WebsocketsModule, ChainModule, MaintenanceModule],
  controllers: [GamesController],
  providers: [
    GamesService,
    StakesService,
    StakeSweeper,
    BattleshipMatchService,
    BattleshipGateway,
    LudoMatchService,
    LudoGateway,
    RpsMatchService,
    RpsGateway,
    ChromaMatchService,
    ChromaGateway,
    SalvoMatchService,
    SalvoGateway,
    GameDeadlineSweeper,
  ],
})
export class GamesModule {}
