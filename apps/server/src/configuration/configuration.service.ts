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
  public readonly JWT_SECRET: string;
  public readonly JWT_EXPIRES_IN: string;
  /** Lifetime of a refresh token, in days. Rotated on every use. */
  public readonly REFRESH_TOKEN_EXPIRES_IN_DAYS: number;
  /** Optional — when unset, the cache falls back to in-memory (single instance). */
  public readonly REDIS_URL: string | undefined;
  /** Optional — when unset, EmailService logs tokens instead of sending them. */
  public readonly RESEND_API_KEY: string | undefined;
  /** Optional — when unset, the /admin endpoints reject every request. */
  public readonly ADMIN_TOKEN: string | undefined;
  public readonly EMAIL_FROM: string;
  public readonly IS_PRODUCTION: boolean;

  // ---- App Review demo login ---------------------------------------------
  /** The fixed-code demo account's email (defaults to demo@playkombat.xyz). */
  public readonly DEMO_LOGIN_EMAIL: string;
  /**
   * Optional fixed login code for the demo account. When set, that email logs
   * in with this exact code and skips the email OTP entirely - for handing a
   * throwaway account to Apple/iOS review. Off (no bypass) unless set. Must be
   * 8 characters to satisfy the login-code format.
   */
  public readonly DEMO_LOGIN_CODE: string | undefined;

  // ---- staking / chain (optional as a group: unset ⇒ staking disabled,
  // free games unaffected) -------------------------------------------------
  public readonly CHAIN_RPC_URL: string | undefined;
  public readonly CHAIN_ID: number;
  /** The platform's hot key - signs pot withdrawals and gas top-ups. */
  public readonly OPERATOR_PRIVATE_KEY: string | undefined;
  /** Confirmations to await before treating a chain tx as final. */
  public readonly CHAIN_CONFIRMATIONS: number;
  /** Max stake per player in human units (applies to every asset). */
  public readonly STAKE_MAX: number;
  /** ETH sent to a fresh wallet so it can pay for its own first deposit. */
  public readonly ESCROW_GAS_DUST_ETH: string;

  // ---- stake pot (pooled staking) ----------------------------------------
  /** The StakePot contract. Unset means staked games are unavailable. */
  public readonly STAKE_POT_ADDRESS: string | undefined;
  /** Platform fee on a settled match, in basis points. Capped at 10%. */
  public readonly STAKE_FEE_BPS: number;
  /** How often the watcher scans for new pot events. */
  public readonly STAKE_POT_POLL_MS: number;
  /** Block the pot was deployed in — where a fresh cursor starts scanning.
   *  Unset ⇒ start at the current head (no backfill). */
  public readonly STAKE_POT_DEPLOY_BLOCK: number | undefined;
  /** How often ledger totals are checked against contract holdings. */
  public readonly STAKE_POT_RECONCILE_MS: number;
  /**
   * Hot wallet that funds the signup grant. Deliberately separate from the
   * operator: it holds a small KC float and nothing else, so leaking it costs a
   * top-up rather than the pot. Unset ⇒ no grants are made.
   */
  public readonly FAUCET_KEY: string | undefined;
  /** KC granted to each new player, in human units. 0 disables the grant. */
  public readonly FAUCET_GRANT_KOMBAT: number;

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
    this.JWT_SECRET = this.configService.getOrThrow('JWT_SECRET');
    // Short by design: the refresh token carries session longevity now, and a
    // leaked access token stops being useful in days rather than a month.
    this.JWT_EXPIRES_IN = this.configService.get('JWT_EXPIRES_IN') ?? '2d';
    this.REFRESH_TOKEN_EXPIRES_IN_DAYS = parseInt(
      this.configService.get('REFRESH_TOKEN_EXPIRES_IN_DAYS') ?? '30',
      10,
    );
    this.REDIS_URL = this.configService.get('REDIS_URL');
    this.RESEND_API_KEY = this.configService.get('RESEND_API_KEY');
    this.ADMIN_TOKEN = this.configService.get('ADMIN_TOKEN');
    this.EMAIL_FROM =
      this.configService.get('EMAIL_FROM') ?? 'login@gaming-platform.local';
    this.IS_PRODUCTION =
      (this.configService.get('NODE_ENV') ?? 'development') === 'production';

    this.DEMO_LOGIN_EMAIL = (
      this.configService.get('DEMO_LOGIN_EMAIL') ?? 'demo@playkombat.xyz'
    )
      .trim()
      .toLowerCase();
    this.DEMO_LOGIN_CODE = this.configService.get('DEMO_LOGIN_CODE');

    this.CHAIN_RPC_URL = this.configService.get('CHAIN_RPC_URL');
    this.CHAIN_ID = parseInt(
      this.configService.get('CHAIN_ID') ?? '11155111', // Sepolia
      10,
    );
    this.OPERATOR_PRIVATE_KEY = this.configService.get('OPERATOR_PRIVATE_KEY');
    this.CHAIN_CONFIRMATIONS = parseInt(
      this.configService.get('CHAIN_CONFIRMATIONS') ?? '1',
      10,
    );
    this.STAKE_MAX = parseInt(
      this.configService.get('STAKE_MAX') ?? '1000',
      10,
    );
    this.ESCROW_GAS_DUST_ETH =
      this.configService.get('ESCROW_GAS_DUST_ETH') ?? '0.002';

    this.STAKE_POT_ADDRESS = this.configService.get('STAKE_POT_ADDRESS');
    const feeBps = parseInt(this.configService.get('STAKE_FEE_BPS') ?? '500', 10);
    if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps > 1000) {
      throw new Error(
        `STAKE_FEE_BPS must be an integer between 0 and 1000, got ${feeBps}`,
      );
    }
    this.STAKE_FEE_BPS = feeBps;
    this.STAKE_POT_POLL_MS = parseInt(
      this.configService.get('STAKE_POT_POLL_MS') ?? '5000',
      10,
    );
    const deployBlock = this.configService.get('STAKE_POT_DEPLOY_BLOCK');
    this.STAKE_POT_DEPLOY_BLOCK =
      deployBlock === undefined ? undefined : parseInt(deployBlock, 10);
    this.STAKE_POT_RECONCILE_MS = parseInt(
      this.configService.get('STAKE_POT_RECONCILE_MS') ?? '600000',
      10,
    );
    this.FAUCET_KEY = this.configService.get('FAUCET_KEY');
    this.FAUCET_GRANT_KOMBAT = parseInt(
      this.configService.get('FAUCET_GRANT_KOMBAT') ?? '0',
      10,
    );
  }
}
