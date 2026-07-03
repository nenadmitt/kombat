import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

import { ConfigurationModule } from '../configuration/configuration.module';
import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from './db.service';
import { EmailLoginTokenEntity } from './entities/email-login-token.entity';
import { GameRoomEntity } from './entities/game-room.entity';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { MigrationService } from './migration.service';

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
        entities: [
          UserEntity,
          EmailLoginTokenEntity,
          WalletEntity,
          GameRoomEntity,
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
      WalletEntity,
      GameRoomEntity,
    ]),
  ],
  providers: [MigrationService, DbService],
  exports: [DbService],
})
export class DbModule {}
