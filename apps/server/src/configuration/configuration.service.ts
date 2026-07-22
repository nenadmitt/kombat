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
  /** TLS to Postgres (managed providers require it; sslmode=require
   *  semantics - encrypted, no CA verification). */
  public readonly POSTGRES_SSL: boolean;
  public readonly WALLET_ENCRYPTION_KEY: string;
  public readonly JWT_SECRET: string;
  public readonly JWT_EXPIRES_IN: string;
  /** Optional — when unset, the cache falls back to in-memory (single instance). */
  public readonly REDIS_URL: string | undefined;
  /** Optional — when unset, EmailService logs tokens instead of sending them. */
  public readonly RESEND_API_KEY: string | undefined;
  public readonly EMAIL_FROM: string;
  public readonly IS_PRODUCTION: boolean;

  // ---- staking / chain (optional as a group: unset ⇒ staking disabled,
  // free games unaffected) -------------------------------------------------
  public readonly CHAIN_RPC_URL: string | undefined;
  public readonly CHAIN_ID: number;
  public readonly ESCROW_ADDRESS: string | undefined;
  /** The escrow operator's hot key — signs create/fund/settle/void. */
  public readonly OPERATOR_PRIVATE_KEY: string | undefined;
  /** Confirmations to await before treating a stake tx as final. */
  public readonly CHAIN_CONFIRMATIONS: number;
  /** Max stake per player in human units (applies to every asset). */
  public readonly STAKE_MAX: number;
  /** Standing escrow allowance pre-approved from each custodial wallet, in
   *  human units per token. */
  public readonly ESCROW_APPROVAL_AMOUNT: number;
  /** ETH sent to a wallet so it can pay its own approve-tx gas. */
  public readonly ESCROW_GAS_DUST_ETH: string;

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
    this.POSTGRES_SSL = this.configService.get('POSTGRES_SSL') === 'true';
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

    this.CHAIN_RPC_URL = this.configService.get('CHAIN_RPC_URL');
    this.CHAIN_ID = parseInt(
      this.configService.get('CHAIN_ID') ?? '11155111', // Sepolia
      10,
    );
    this.ESCROW_ADDRESS = this.configService.get('ESCROW_ADDRESS');
    this.OPERATOR_PRIVATE_KEY = this.configService.get('OPERATOR_PRIVATE_KEY');
    this.CHAIN_CONFIRMATIONS = parseInt(
      this.configService.get('CHAIN_CONFIRMATIONS') ?? '1',
      10,
    );
    this.STAKE_MAX = parseInt(
      this.configService.get('STAKE_MAX') ?? '1000',
      10,
    );
    this.ESCROW_APPROVAL_AMOUNT = parseInt(
      this.configService.get('ESCROW_APPROVAL_AMOUNT') ?? '10000',
      10,
    );
    this.ESCROW_GAS_DUST_ETH =
      this.configService.get('ESCROW_GAS_DUST_ETH') ?? '0.002';
  }
}
