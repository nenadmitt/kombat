import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { UserPlatform, type AuthSession } from '@gaming-platform/core';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { EmailService } from '../emails/email.service';
import { SiweService } from './siwe.service';
import { generateLoginToken } from './token.util';

const TOKEN_TTL_MS = 15 * 60 * 1000;

const REFRESH_TOKEN_BYTES = 32;

const MIN_BOT_SECRET_LENGTH = 16;

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigurationService,
    private readonly siweService: SiweService,
  ) {}

  requestSiweNonce(): Promise<string> {
    return this.siweService.issueNonce();
  }

  async signInWithEthereum(
    message: string,
    signature: string,
    platform: UserPlatform,
  ): Promise<AuthSession> {
    const address = await this.siweService.verify(message, signature);
    const wallet = await this.dbService.findWalletByAddress(address);
    if (wallet) {
      const user = await this.dbService.findUserById(wallet.userId);
      if (user) {
        this.assertPlatform(user.platform, platform, user.email);
      }
      return this.issueSession(wallet.userId);
    }
    const created = await this.dbService.createWalletUser(address, platform);
    return this.issueSession(created.id);
  }

  async signInAsBot(username: string, secret: string): Promise<AuthSession> {
    const expected = this.configService.BOT_SECRET;
    if (!expected || expected.length < MIN_BOT_SECRET_LENGTH) {
      throw new UnauthorizedException(
        `Bot sign-in is disabled: BOT_SECRET is unset or under ${MIN_BOT_SECRET_LENGTH} characters`,
      );
    }
    const provided = Buffer.from(secret);
    const wanted = Buffer.from(expected);
    if (
      provided.length !== wanted.length ||
      !timingSafeEqual(provided, wanted)
    ) {
      throw new UnauthorizedException('Invalid bot credentials');
    }

    const user = await this.dbService.findUserByUsername(username);
    // Same answer either way, so the secret can't probe which usernames exist or are bots.
    if (!user || !user.isBot) {
      throw new UnauthorizedException('Invalid bot credentials');
    }
    return this.issueSession(user.id);
  }

  // Custody differs per app (device key vs platform-held key), so the other app couldn't operate the wallet.
  private assertPlatform(
    account: UserPlatform,
    caller: UserPlatform,
    email?: string | null,
  ): void {
    // The demo login is shared for app reviews and is reachable from both apps by design.
    if (email && this.isDemoLogin(email)) return;
    if (account === caller) return;
    throw new ForbiddenException(
      account === UserPlatform.Mobile
        ? 'This account belongs to the mobile app. Sign in there.'
        : 'This account belongs to the web app. Sign in there.',
    );
  }

  async requestToken(email: string, platform: UserPlatform): Promise<void> {
    if (this.isDemoLogin(email)) {
      await this.ensureUser(email, platform);
      return;
    }
    const token = await this.createLoginToken(email, platform);
    await this.emailService.sendLoginToken(email, token);
  }

  private isDemoLogin(email: string): boolean {
    return (
      !!this.configService.DEMO_LOGIN_CODE &&
      email.trim().toLowerCase() === this.configService.DEMO_LOGIN_EMAIL
    );
  }

  private async ensureUser(email: string, platform: UserPlatform) {
    const existing = await this.dbService.findUserByEmail(email);
    if (existing) {
      this.assertPlatform(existing.platform, platform, existing.email);
      return existing;
    }
    return this.dbService.createUser(email, platform);
  }

  async requestTestToken(
    email: string,
    platform: UserPlatform,
  ): Promise<string> {
    if (this.configService.IS_PRODUCTION) {
      throw new NotFoundException();
    }
    return this.createLoginToken(email, platform);
  }

  private async createLoginToken(
    email: string,
    platform: UserPlatform,
  ): Promise<string> {
    let user = await this.dbService.findUserByEmail(email);
    if (!user) {
      user = await this.dbService.createUser(email, platform);
    }

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
    platform: UserPlatform,
  ): Promise<AuthSession> {
    if (this.isDemoLogin(email)) {
      if (token !== this.configService.DEMO_LOGIN_CODE) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      const demoUser = await this.ensureUser(email, platform);
      return this.issueSession(demoUser.id);
    }

    const user = await this.dbService.findUserByEmail(email);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const tokenEntity = await this.dbService.findLoginToken(user.id, token);
    if (!tokenEntity || tokenEntity.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Only after the code is proven: an earlier 403 would reveal which emails have accounts.
    this.assertPlatform(user.platform, platform, user.email);

    await this.dbService.deleteLoginToken(tokenEntity.id);

    return this.issueSession(user.id);
  }

  // A revoked token presented again means it was copied, so every session for the user is revoked.
  async refreshSession(
    refreshToken: string,
    platform: UserPlatform,
  ): Promise<AuthSession> {
    const row = await this.dbService.findRefreshTokenByHash(
      hashRefreshToken(refreshToken),
    );
    if (!row) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (row.revokedAt) {
      this.logger.error(
        `Refresh token reuse detected for user ${row.userId} - revoking every session`,
      );
      await this.dbService.revokeRefreshTokensForUser(row.userId);
      throw new UnauthorizedException('Invalid or expired session');
    }

    if (row.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    // Otherwise a copied refresh token could walk around the platform check from the other app.
    const owner = await this.dbService.findUserById(row.userId);
    if (owner) {
      this.assertPlatform(owner.platform, platform, owner.email);
    }

    // Conditional revoke, so two concurrent refreshes with the same token can't both mint a pair.
    if (!(await this.dbService.revokeRefreshToken(row.id))) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return this.issueSession(row.userId);
  }

  async logout(refreshToken: string): Promise<void> {
    const row = await this.dbService.findRefreshTokenByHash(
      hashRefreshToken(refreshToken),
    );
    if (row && !row.revokedAt) {
      await this.dbService.revokeRefreshToken(row.id);
    }
  }

  private async issueSession(userId: string): Promise<AuthSession> {
    const accessToken = await this.jwtService.signAsync({ sub: userId });

    const refreshToken = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const expiresAt = new Date(
      Date.now() +
        this.configService.REFRESH_TOKEN_EXPIRES_IN_DAYS * 24 * 60 * 60 * 1000,
    );
    await this.dbService.createRefreshToken({
      userId,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt,
    });

    return { accessToken, refreshToken };
  }
}

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
