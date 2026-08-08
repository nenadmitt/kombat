import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes } from 'crypto';
import { UserPlatform, type AuthSession } from '@gaming-platform/core';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { EmailService } from '../emails/email.service';
import { SiweService } from './siwe.service';
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
    private readonly siweService: SiweService,
  ) {}

  requestSiweNonce(): Promise<string> {
    return this.siweService.issueNonce();
  }

  /**
   * Sign in with a wallet. The address itself is the identity: an existing
   * wallet row resolves to its owner, an unknown one opens a new account.
   */
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

  /**
   * An account belongs to the app that created it. The custody models differ
   * (a mobile wallet lives on the device, a web one is held encrypted by the
   * platform), so signing in from the other app would hand someone a session
   * whose wallet their client cannot operate.
   */
  private assertPlatform(
    account: UserPlatform,
    caller: UserPlatform,
    email?: string | null,
  ): void {
    // The demo identity is a shared login handed out for reviews and demos,
    // not somebody's account. It is reachable from both apps by design.
    if (email && this.isDemoLogin(email)) return;
    if (account === caller) return;
    throw new ForbiddenException(
      account === UserPlatform.Mobile
        ? 'This account belongs to the mobile app. Sign in there.'
        : 'This account belongs to the web app. Sign in there.',
    );
  }

  async requestToken(email: string, platform: UserPlatform): Promise<void> {
    // Demo account: no inbox to mail, and the code is fixed. Just make sure
    // the user row exists so the exchange can sign a token for it.
    if (this.isDemoLogin(email)) {
      await this.ensureUser(email, platform);
      return;
    }
    const token = await this.createLoginToken(email, platform);
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

  private async ensureUser(email: string, platform: UserPlatform) {
    const existing = await this.dbService.findUserByEmail(email);
    if (existing) {
      this.assertPlatform(existing.platform, platform, existing.email);
      return existing;
    }
    return this.dbService.createUser(email, platform);
  }

  /**
   * Same as requestToken, but returns the token instead of emailing it, so
   * local/CI testing doesn't depend on a real inbox. 404s in production.
   */
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
    if (user) {
      this.assertPlatform(user.platform, platform, user.email);
    } else {
      user = await this.dbService.createUser(email, platform);
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
    platform: UserPlatform,
  ): Promise<AuthSession> {
    // Demo account: accept only the fixed code, bypassing the stored OTP.
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
    this.assertPlatform(user.platform, platform, user.email);

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

    // The login check is worth nothing if a copied refresh token can walk
    // around it from the other app.
    const owner = await this.dbService.findUserById(row.userId);
    if (owner) {
      this.assertPlatform(owner.platform, platform, owner.email);
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
