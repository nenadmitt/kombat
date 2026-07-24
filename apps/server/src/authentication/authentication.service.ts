import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { EmailService } from '../emails/email.service';
import { generateLoginToken } from './token.util';

const TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class AuthenticationService {
  constructor(
    private readonly dbService: DbService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigurationService,
  ) {}

  async requestToken(email: string): Promise<void> {
    // Demo account: no inbox to mail, and the code is fixed. Just make sure
    // the user row exists so the exchange can sign a token for it.
    if (this.isDemoLogin(email)) {
      await this.ensureUser(email);
      return;
    }
    const token = await this.createLoginToken(email);
    await this.emailService.sendLoginToken(email, token);
  }

  /**
   * True when a fixed demo code is configured (DEMO_LOGIN_CODE) and `email`
   * is the demo account. Off entirely unless the code is set.
   */
  private isDemoLogin(email: string): boolean {
    return (
      !!this.configService.DEMO_LOGIN_CODE &&
      email.trim().toLowerCase() === this.configService.DEMO_LOGIN_EMAIL
    );
  }

  private async ensureUser(email: string) {
    const existing = await this.dbService.findUserByEmail(email);
    return existing ?? this.dbService.createUser(email);
  }

  /**
   * Same as requestToken, but returns the token instead of emailing it, so
   * local/CI testing doesn't depend on a real inbox. 404s in production.
   */
  async requestTestToken(email: string): Promise<string> {
    if (this.configService.IS_PRODUCTION) {
      throw new NotFoundException();
    }
    return this.createLoginToken(email);
  }

  private async createLoginToken(email: string): Promise<string> {
    let user = await this.dbService.findUserByEmail(email);
    if (!user) {
      user = await this.dbService.createUser(email);
    }

    // Invalidate any previously issued tokens for this user.
    await this.dbService.deleteLoginTokensForUser(user.id);

    const token = generateLoginToken();
    await this.dbService.createLoginToken({
      userId: user.id,
      token,
      expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
    });

    return token;
  }

  async exchangeToken(
    email: string,
    token: string,
  ): Promise<{ accessToken: string }> {
    // Demo account: accept only the fixed code, bypassing the stored OTP.
    if (this.isDemoLogin(email)) {
      if (token !== this.configService.DEMO_LOGIN_CODE) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      const demoUser = await this.ensureUser(email);
      const accessToken = await this.jwtService.signAsync({ sub: demoUser.id });
      return { accessToken };
    }

    const user = await this.dbService.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const tokenEntity = await this.dbService.findLoginToken(user.id, token);
    if (!tokenEntity || tokenEntity.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Single-use: delete once exchanged, regardless of outcome below.
    await this.dbService.deleteLoginToken(tokenEntity.id);

    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    return { accessToken };
  }
}
