import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule, seconds } from '@nestjs/throttler';
import { config as loadEnv } from 'dotenv';

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
import { isProductionEnv } from './configuration/node-env';

// The imports array is evaluated before ConfigModule loads .env.
loadEnv();

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    // Per-IP, per-route. Off outside production so the e2e suite and local
    // scripts can hammer the API.
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: seconds(60), limit: 100 }],
      skipIf: () => !isProductionEnv(process.env.NODE_ENV),
    }),
    CacheModule,
    DbModule,
    AuthenticationModule,
    UsersModule,
    WalletsModule,
    ...(isProductionEnv(process.env.NODE_ENV) ? [] : [TestModule]),
    WebsocketsModule,
    StakePotModule,
    GamesModule,
    MaintenanceModule,
    AdminModule,
  ],
  controllers: [AppController],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
