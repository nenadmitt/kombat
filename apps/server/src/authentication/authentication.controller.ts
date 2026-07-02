import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { AuthenticationService } from './authentication.service';
import { ISecurityContext } from './authentication.types';
import { SecurityContext } from './decorators/security-context.decorator';
import { ExchangeTokenDto } from './dto/exchange-token.dto';
import { RequestTokenDto } from './dto/request-token.dto';
import { JwtTokenGuard } from './guards/jwt-token.guard';

@Controller('authentication')
export class AuthenticationController {
  constructor(private readonly authenticationService: AuthenticationService) {}

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

  @Post('exchange-token')
  async exchangeToken(
    @Body() dto: ExchangeTokenDto,
  ): Promise<{ accessToken: string }> {
    return this.authenticationService.exchangeToken(dto.email, dto.token);
  }

  /** Example of a guarded route using JwtTokenGuard + @SecurityContext(). */
  @Get('me')
  @UseGuards(JwtTokenGuard)
  me(@SecurityContext() securityContext: ISecurityContext): ISecurityContext {
    return securityContext;
  }
}
