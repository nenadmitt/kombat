import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import type { AuthSession } from '@gaming-platform/core';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { EmailService } from '../emails/email.service';
import { generateLoginToken } from './token.util';

const TOKEN_TTL_MS = 15 * 60 * 1000;

/** 256 bits of entropy, hex-encoded - guessing is not a threat model. */
const REFRESH_TOKEN_BYTES = 32;

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name);

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

  async exchangeToken(email: string, token: string): Promise<AuthSession> {
    // Demo account: accept only the fixed code, bypassing the stored OTP.
    if (this.isDemoLogin(email)) {
      if (token !== this.configService.DEMO_LOGIN_CODE) {
        throw new UnauthorizedException('Invalid or expired token');
      }
      const demoUser = await this.ensureUser(email);
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

    // Single-use: delete once exchanged, regardless of outcome below.
    await this.dbService.deleteLoginToken(tokenEntity.id);

    return this.issueSession(user.id);
  }

  /**
   * Trade a refresh token for a brand new pair, invalidating the one presented.
   *
   * Rotation is what keeps a long-lived credential safe: the token that just
   * bought this session is dead the moment it is used, so a copy stolen from a
   * backup or an intercepted response has a useful life measured in the gap
   * before the real client next refreshes.
   *
   * Presenting an already-revoked token means two parties hold it. There is no
   * way to tell the thief from the victim, so every live token for that user is
   * revoked and both are forced back through email login.
   */
  async refreshSession(refreshToken: string): Promise<AuthSession> {
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

    // Conditional revoke, so two concurrent refreshes with the same token can't
    // both mint a pair - the loser is told to log in again rather than being
    // handed a second live session.
    if (!(await this.dbService.revokeRefreshToken(row.id))) {
      throw new UnauthorizedException('Invalid or expired session');
    }

    return this.issueSession(row.userId);
  }

  /** End one session. Best-effort: an unknown token is already not a session. */
  async logout(refreshToken: string): Promise<void> {
    const row = await this.dbService.findRefreshTokenByHash(
      hashRefreshToken(refreshToken),
    );
    if (row && !row.revokedAt) {
      await this.dbService.revokeRefreshToken(row.id);
    }
  }

  /** A short-lived access token plus the rotating refresh token behind it. */
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

/** Stored hashed, so a database leak yields no usable session. */
function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
