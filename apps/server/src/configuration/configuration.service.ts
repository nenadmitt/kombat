import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class ConfigurationService {
  public readonly PORT: number;
  public readonly POSTGRES_HOST: string;
  public readonly POSTGRES_PORT: number;
  public readonly POSTGRES_DB: string;
  public readonly POSTGRES_USER: string;
  public readonly POSTGRES_PASSWORD: string;
  public readonly WALLET_ENCRYPTION_KEY: string;
  public readonly JWT_SECRET: string;
  public readonly JWT_EXPIRES_IN: string;
  /** Optional — when unset, the cache falls back to in-memory (single instance). */
  public readonly REDIS_URL: string | undefined;
  /** Optional — when unset, EmailService logs tokens instead of sending them. */
  public readonly RESEND_API_KEY: string | undefined;
  public readonly EMAIL_FROM: string;
  public readonly IS_PRODUCTION: boolean;

  constructor(private readonly configService: ConfigService) {
    this.PORT = parseInt(this.configService.get('PORT') ?? '3000', 10);
    this.POSTGRES_HOST = this.configService.getOrThrow('POSTGRES_HOST');
    this.POSTGRES_PORT = parseInt(
      this.configService.get('POSTGRES_PORT') ?? '5432',
      10,
    );
    this.POSTGRES_DB = this.configService.getOrThrow('POSTGRES_DB');
    this.POSTGRES_USER = this.configService.getOrThrow('POSTGRES_USER');
    this.POSTGRES_PASSWORD =
      this.configService.getOrThrow('POSTGRES_PASSWORD');
    this.WALLET_ENCRYPTION_KEY = this.configService.getOrThrow(
      'WALLET_ENCRYPTION_KEY',
    );
    this.JWT_SECRET = this.configService.getOrThrow('JWT_SECRET');
    this.JWT_EXPIRES_IN = this.configService.get('JWT_EXPIRES_IN') ?? '30d';
    this.REDIS_URL = this.configService.get('REDIS_URL');
    this.RESEND_API_KEY = this.configService.get('RESEND_API_KEY');
    this.EMAIL_FROM =
      this.configService.get('EMAIL_FROM') ?? 'login@gaming-platform.local';
    this.IS_PRODUCTION =
      (this.configService.get('NODE_ENV') ?? 'development') === 'production';
  }
}
