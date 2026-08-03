import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { AdminModule } from '../admin/admin.module';
import { AuthenticationModule } from '../authentication/authentication.module';
import { ConfigurationModule } from '../configuration/configuration.module';
import { MaintenanceModule } from '../maintenance';
import { WebsocketsModule } from '../websockets';
import { PotEventWatcher } from './pot-event.watcher';
import { FaucetService } from './faucet.service';
import { StakeLedgerEntryEntity } from './entities/stake-ledger-entry.entity';
import { StakePotGrantEntity } from './entities/stake-pot-grant.entity';
import { StakePotCursorEntity } from './entities/stake-pot-cursor.entity';
import { StakePotWithdrawalEntity } from './entities/stake-pot-withdrawal.entity';
import { StakedBalanceEntity } from './entities/staked-balance.entity';
import { ReconciliationJob } from './reconciliation.job';
import { StakePotChainService } from './stake-pot-chain.service';
import { StakePotController } from './stake-pot.controller';
import { StakePotService } from './stake-pot.service';
import { WithdrawalSweeper } from './withdrawal.sweeper';

/**
 * Pooled staking: the balance ledger, its chain access, and the jobs that move
 * money in (PotEventWatcher) and out (WithdrawalSweeper).
 *
 * Self-contained so it can be lifted into its own service later: it owns its
 * four tables and registers their repositories here instead of going through
 * DbService. It borrows only user/address lookups and the socket fan-out - the
 * two seams that become RPC calls if this moves out.
 *
 * Nothing here may import from `games/`; the dependency runs the other way.
 */
@Module({
  imports: [
    ConfigurationModule,
    WebsocketsModule,
    AuthenticationModule,
    AdminModule,
    MaintenanceModule,
    TypeOrmModule.forFeature([
      StakedBalanceEntity,
      StakeLedgerEntryEntity,
      StakePotWithdrawalEntity,
      StakePotCursorEntity,
      StakePotGrantEntity,
    ]),
  ],
  controllers: [StakePotController],
  providers: [
    StakePotService,
    StakePotChainService,
    PotEventWatcher,
    WithdrawalSweeper,
    ReconciliationJob,
    FaucetService,
  ],
  exports: [StakePotService, StakePotChainService, FaucetService],
})
export class StakePotModule {}
