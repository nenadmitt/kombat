import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

import { ConfigurationModule } from '../configuration/configuration.module';
import { ConfigurationService } from '../configuration/configuration.service';
import { AppSettingEntity } from './entities/app-setting.entity';
import { DbService } from './db.service';
import { EmailLoginTokenEntity } from './entities/email-login-token.entity';
import { GameRoomEntity } from './entities/game-room.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { MatchSettlementEntity } from './entities/match-settlement.entity';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { MigrationService } from './migration.service';
import { StakedBalanceEntity } from '../stake-pot/entities/staked-balance.entity';
import { StakeLedgerEntryEntity } from '../stake-pot/entities/stake-ledger-entry.entity';
import { StakePotCursorEntity } from '../stake-pot/entities/stake-pot-cursor.entity';
import { StakePotGrantEntity } from '../stake-pot/entities/stake-pot-grant.entity';
import { StakePotWithdrawalEntity } from '../stake-pot/entities/stake-pot-withdrawal.entity';

// Global — DbService is the sole way other modules touch the database, so
// every module needs it available without importing DbModule individually
// (mirrors how ConfigurationModule is global for the same reason).
@Global()
@Module({
  imports: [
    TypeOrmModule.forRootAsync({
      imports: [ConfigurationModule],
      useFactory: (configService: ConfigurationService) => ({
        type: 'postgres',
        host: configService.POSTGRES_HOST,
        port: configService.POSTGRES_PORT,
        username: configService.POSTGRES_USER,
        password: configService.POSTGRES_PASSWORD,
        database: configService.POSTGRES_DB,
        // sslmode=require semantics: encrypted link, no CA verification
        // (managed providers like DO use a private CA).
        ssl: configService.POSTGRES_SSL
          ? { rejectUnauthorized: false }
          : false,
        entities: [
          UserEntity,
          EmailLoginTokenEntity,
          RefreshTokenEntity,
          WalletEntity,
          GameRoomEntity,
          MatchSettlementEntity,
          AppSettingEntity,
          // Owned by StakePotModule (which registers their repositories
          // itself, so it can be lifted out into its own service), but the
          // connection still has to know their metadata.
          StakedBalanceEntity,
          StakeLedgerEntryEntity,
          StakePotWithdrawalEntity,
          StakePotCursorEntity,
          StakePotGrantEntity,
        ],
        synchronize: false,
        // Migrations are applied explicitly by MigrationService on boot, not
        // by TypeORM's own connection setup — see the comment there.
        migrationsRun: false,
        migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
        migrationsTableName: 'migrations_typeorm',
      }),
      inject: [ConfigurationService],
    }),
    TypeOrmModule.forFeature([
      UserEntity,
      EmailLoginTokenEntity,
      RefreshTokenEntity,
      WalletEntity,
      GameRoomEntity,
      MatchSettlementEntity,
      AppSettingEntity,
    ]),
  ],
  providers: [MigrationService, DbService],
  exports: [DbService],
})
export class DbModule {}
