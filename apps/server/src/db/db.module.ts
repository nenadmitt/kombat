import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';

import { ConfigurationModule } from '../configuration/configuration.module';
import { ConfigurationService } from '../configuration/configuration.service';
import { EmailLoginTokenEntity } from './entities/email-login-token.entity';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { MigrationService } from './migration.service';

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
        entities: [UserEntity, EmailLoginTokenEntity, WalletEntity],
        synchronize: false,
        // Migrations are applied explicitly by MigrationService on boot, not
        // by TypeORM's own connection setup — see the comment there.
        migrationsRun: false,
        migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
        migrationsTableName: 'migrations_typeorm',
      }),
      inject: [ConfigurationService],
    }),
    TypeOrmModule.forFeature([UserEntity, EmailLoginTokenEntity]),
  ],
  providers: [MigrationService],
  exports: [TypeOrmModule],
})
export class DbModule {}
