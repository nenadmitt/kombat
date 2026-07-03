import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AuthenticationModule } from './authentication';
import { DbModule } from './db';
import { GamesModule } from './games/games.module';
import { TestModule } from './test/test.module';
import { UsersModule } from './users/users.module';
import { WalletsModule } from './wallets/wallets.module';
import { WebsocketsModule } from './websockets';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DbModule,
    AuthenticationModule,
    UsersModule,
    WalletsModule,
    TestModule,
    WebsocketsModule,
    GamesModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
