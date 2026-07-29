import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AdminModule } from './admin/admin.module';
import { AppController } from './app.controller';
import { AuthenticationModule } from './authentication';
import { CacheModule } from './cache';
import { DbModule } from './db';
import { GamesModule } from './games/games.module';
import { MaintenanceModule } from './maintenance';
import { StakePotModule } from './stake-pot';
import { TestModule } from './test/test.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { WebsocketsModule } from './websockets';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    CacheModule,
    DbModule,
    AuthenticationModule,
    UsersModule,
    WalletsModule,
    TestModule,
    WebsocketsModule,
    StakePotModule,
    GamesModule,
    MaintenanceModule,
    AdminModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
