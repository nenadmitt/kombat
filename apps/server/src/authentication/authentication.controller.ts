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
import type { AuthSession } from '@gaming-platform/core';

import { AuthenticationService } from './authentication.service';
import { ISecurityContext } from './authentication.types';
import { SecurityContext } from './decorators/security-context.decorator';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RequestTokenDto } from './dto/request-token.dto';
import { SiweVerifyDto } from './dto/siwe-verify.dto';
import { JwtTokenGuard } from './guards/jwt-token.guard';

@Controller('authentication')
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

  // Sends an email per call - throttled well below the global default.
  @Throttle({ default: { ttl: seconds(60), limit: 5 } })
  @Post('request-token')
  async requestToken(@Body() dto: RequestTokenDto): Promise<{ success: true }> {
    await this.authenticationService.requestToken(dto.email);
    return { success: true };
  }

  /**
   * Dev/test-only: same as request-token, but returns the token directly
   * instead of emailing it. 404s outside development.
   */
  @Post('request-token/test')
  async requestTestToken(
    @Body() dto: RequestTokenDto,
  ): Promise<{ token: string }> {
    const token = await this.authenticationService.requestTestToken(dto.email);
    return { token };
  }

  // The login-code brute-force surface.
  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @Post('exchange-token')
  async exchangeToken(@Body() dto: ExchangeTokenDto): Promise<AuthSession> {
    return this.authenticationService.exchangeToken(dto.email, dto.token);
  }

  @Throttle({ default: { ttl: seconds(60), limit: 20 } })
  @Post('siwe/nonce')
  @HttpCode(HttpStatus.OK)
  async siweNonce(): Promise<{ nonce: string }> {
    return { nonce: await this.authenticationService.requestSiweNonce() };
  }

  @Throttle({ default: { ttl: seconds(60), limit: 10 } })
  @Post('siwe/verify')
  @HttpCode(HttpStatus.OK)
  async siweVerify(@Body() dto: SiweVerifyDto): Promise<AuthSession> {
    return this.authenticationService.signInWithEthereum(
      dto.message,
      dto.signature,
    );
  }

  /**
   * Trade a refresh token for a new access/refresh pair. Deliberately
   * unguarded: the refresh token *is* the credential, and the access token it
   * replaces has usually expired by the time a client gets here.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto): Promise<AuthSession> {
    return this.authenticationService.refreshSession(dto.refreshToken);
  }

  /** Revoke one session. Always 204, so it can't be used to probe tokens. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: RefreshTokenDto): Promise<void> {
    await this.authenticationService.logout(dto.refreshToken);
  }

  /** Example of a guarded route using JwtTokenGuard + @SecurityContext(). */
  @Get('me')
  @UseGuards(JwtTokenGuard)
  me(@SecurityContext() securityContext: ISecurityContext): ISecurityContext {
    return securityContext;
  }
}
