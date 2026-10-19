import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Throttle, seconds } from '@nestjs/throttler';
import type { AuthSession, UserPlatform } from '@gaming-platform/core';

import { AuthenticationService } from './authentication.service';
import { ISecurityContext } from './authentication.types';
import { CallerPlatform } from './decorators/caller-platform.decorator';
import { SecurityContext } from './decorators/security-context.decorator';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { BotLoginDto } from './dto/bot-login.dto';
import { RequestTokenDto } from './dto/request-token.dto';
import { SiweVerifyDto } from './dto/siwe-verify.dto';
import { JwtTokenGuard } from './guards/jwt-token.guard';

@Controller('authentication')
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @Post('request-token')
  async requestToken(
    @Body() dto: RequestTokenDto,
    @CallerPlatform() platform: UserPlatform,
  ): Promise<{ success: true }> {
    await this.authenticationService.requestToken(dto.email, platform);
    return { success: true };
  }

  @Post('request-token/test')
  async requestTestToken(
    @Body() dto: RequestTokenDto,
    @CallerPlatform() platform: UserPlatform,
  ): Promise<{ token: string }> {
    const token = await this.authenticationService.requestTestToken(
      dto.email,
      platform,
    );
    return { token };
  }

  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @Post('exchange-token')
  async exchangeToken(
    @Body() dto: ExchangeTokenDto,
    @CallerPlatform() platform: UserPlatform,
  ): Promise<AuthSession> {
    return this.authenticationService.exchangeToken(
      dto.email,
      dto.token,
      platform,
    );
  }

  @Throttle({ default: { ttl: seconds(60), limit: 20 } })
  // Exists in production, unlike request-token/test; it reaches is_bot accounts only.
  @Post('bot-login')
  async botLogin(@Body() dto: BotLoginDto): Promise<AuthSession> {
    return this.authenticationService.signInAsBot(dto.username, dto.secret);
  }

  @Post('siwe/nonce')
  @HttpCode(HttpStatus.OK)
  async siweNonce(): Promise<{ nonce: string }> {
    return { nonce: await this.authenticationService.requestSiweNonce() };
  }

  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @Post('siwe/verify')
  @HttpCode(HttpStatus.OK)
  async siweVerify(
    @Body() dto: SiweVerifyDto,
    @CallerPlatform() platform: UserPlatform,
  ): Promise<AuthSession> {
    return this.authenticationService.signInWithEthereum(
      dto.message,
      dto.signature,
      platform,
    );
  }

  // Unguarded on purpose: the refresh token is the credential, and the access token has usually expired.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshTokenDto,
    @CallerPlatform() platform: UserPlatform,
  ): Promise<AuthSession> {
    return this.authenticationService.refreshSession(dto.refreshToken, platform);
  }

  // Always 204, so it can't be used to probe tokens.
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authenticationService.logout(dto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtTokenGuard)
  me(@SecurityContext() securityContext: ISecurityContext): ISecurityContext {
    return securityContext;
  }
}
