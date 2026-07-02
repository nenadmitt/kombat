import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConfigurationService } from '../configuration/configuration.service';
import { EmailLoginTokenEntity } from '../db/entities/email-login-token.entity';
import { UserEntity } from '../db/entities/user.entity';
import { EmailService } from '../emails/email.service';
import { generateLoginToken } from './token.util';

const TOKEN_TTL_MS = 15 * 60 * 1000;

@Injectable()
export class AuthenticationService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(EmailLoginTokenEntity)
    private readonly tokenRepository: Repository<EmailLoginTokenEntity>,
    private readonly emailService: EmailService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigurationService,
  ) {}

  async requestToken(email: string): Promise<void> {
    const token = await this.createLoginToken(email);
    await this.emailService.sendLoginToken(email, token);
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
    let user = await this.userRepository.findOneBy({ email });
    if (!user) {
      user = await this.userRepository.save(
        this.userRepository.create({ email, username: null }),
      );
    }

    // Invalidate any previously issued tokens for this user.
    await this.tokenRepository.delete({ userId: user.id });

    const token = generateLoginToken();
    await this.tokenRepository.save(
      this.tokenRepository.create({
        userId: user.id,
        token,
        expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
      }),
    );

    return token;
  }

  async exchangeToken(
    email: string,
    token: string,
  ): Promise<{ accessToken: string }> {
    const user = await this.userRepository.findOneBy({ email });
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const tokenEntity = await this.tokenRepository.findOneBy({
      userId: user.id,
      token,
    });
    if (!tokenEntity || tokenEntity.expiresAt < new Date()) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Single-use: delete once exchanged, regardless of outcome below.
    await this.tokenRepository.delete({ id: tokenEntity.id });

    const accessToken = await this.jwtService.signAsync({ sub: user.id });
    return { accessToken };
  }
}
