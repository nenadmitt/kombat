import { Module } from '@nestjs/common';
import { JwtModule, JwtSignOptions } from '@nestjs/jwt';

import { ConfigurationModule } from '../configuration/configuration.module';
import { ConfigurationService } from '../configuration/configuration.service';
import { EmailModule } from '../emails';
import { AuthenticationController } from './authentication.controller';
import { AuthenticationService } from './authentication.service';
import { JwtTokenGuard } from './guards/jwt-token.guard';
import { SiweService } from './siwe.service';

const jwtModule = JwtModule.registerAsync({
  imports: [ConfigurationModule],
  useFactory: (configService: ConfigurationService) => ({
    secret: configService.JWT_SECRET,
    signOptions: {
      // JWT_EXPIRES_IN is a validated env string; `ms`'s literal type can't express that.
      expiresIn: configService.JWT_EXPIRES_IN as JwtSignOptions['expiresIn'],
    },
  }),
  inject: [ConfigurationService],
});

@Module({
  imports: [EmailModule, jwtModule],
  controllers: [AuthenticationController],
  providers: [AuthenticationService, JwtTokenGuard, SiweService],
  // JwtTokenGuard needs JwtService resolvable in every module that imports this one.
  exports: [JwtTokenGuard, jwtModule],
})
export class AuthenticationModule {}
