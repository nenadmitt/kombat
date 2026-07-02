import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { AppController } from './app.controller';
import { AuthenticationModule } from './authentication';
import { DbModule } from './db';
import { WalletsModule } from './wallets/wallets.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: ['.env'] }),
    DbModule,
    AuthenticationModule,
    WalletsModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
