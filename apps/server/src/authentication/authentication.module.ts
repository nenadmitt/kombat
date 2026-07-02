import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ConfigurationModule } from '../configuration/configuration.module';
import { ConfigurationService } from '../configuration/configuration.service';
import { EmailLoginTokenEntity } from '../db/entities/email-login-token.entity';
import { UserEntity } from '../db/entities/user.entity';
import { EmailModule } from '../emails';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';
import { JwtTokenGuard } from './guards/jwt-token.guard';

const jwtModule = JwtModule.registerAsync({
  imports: [ConfigurationModule],
  useFactory: (configService: ConfigurationService) => ({
    secret: configService.JWT_SECRET,
    signOptions: {
      // JWT_EXPIRES_IN is a validated env string (e.g. "30d") at
      // runtime; `ms`'s stricter literal type can't express that here.
      expiresIn: configService.JWT_EXPIRES_IN as JwtSignOptions['expiresIn'],
    },
  }),
  inject: [ConfigurationService],
});

@Module({
  imports: [TypeOrmModule.forFeature([UserEntity, EmailLoginTokenEntity]), EmailModule, jwtModule],
  controllers: [AuthenticationController],
  providers: [AuthenticationService, JwtTokenGuard],
  // Re-export JwtModule too — JwtTokenGuard depends on JwtService, and other
  // modules that import AuthenticationModule just to use the guard need that
  // dependency resolvable in their own scope as well.
  exports: [JwtTokenGuard, jwtModule],
})
export class AuthenticationModule {}
