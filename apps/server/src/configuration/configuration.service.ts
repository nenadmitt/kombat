import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { isProductionEnv } from './node-env';
import { parseEncryptionKey } from '../wallets/key-cipher.util';

@Injectable()
export class ConfigurationService {
  public readonly PORT: number;
  public readonly POSTGRES_HOST: string;
  public readonly POSTGRES_PORT: number;
  public readonly POSTGRES_DB: string;
  public readonly POSTGRES_USER: string;
  public readonly POSTGRES_PASSWORD: string;
  // sslmode=require semantics: encrypted, no CA verification.
  public readonly POSTGRES_SSL: boolean;
  public readonly JWT_SECRET: string;
  public readonly JWT_EXPIRES_IN: string;
  public readonly REFRESH_TOKEN_EXPIRES_IN_DAYS: number;
  public readonly REDIS_URL: string | undefined;
  public readonly RESEND_API_KEY: string | undefined;
  public readonly ADMIN_TOKEN: string | undefined;
  public readonly BOT_SECRET: string | undefined;
  public readonly EMAIL_FROM: string;
  public readonly IS_PRODUCTION: boolean;

  public readonly DEMO_LOGIN_EMAIL: string;
  public readonly DEMO_LOGIN_CODE: string | undefined;

  public readonly SIWE_DOMAINS: string[];

  public readonly CHAIN_RPC_URL: string | undefined;
  public readonly CHAIN_ID: number;
  public readonly OPERATOR_PRIVATE_KEY: string | undefined;
  public readonly W_ENCRYPT: string | undefined;
  public readonly CHAIN_CONFIRMATIONS: number;
  public readonly STAKE_MAX: number;
  public readonly WALLET_GAS_DUST_ETH: string;

  public readonly STAKE_POT_ADDRESS: string | undefined;
  public readonly STAKE_FEE_BPS: number;
  public readonly STAKE_POT_POLL_MS: number;
  public readonly STAKE_POT_DEPLOY_BLOCK: number | undefined;
  public readonly STAKE_POT_RECONCILE_MS: number;
  // Separate from the operator: it holds a small KC float, so leaking it costs a top-up, not the pot.
  public readonly FAUCET_KEY: string | undefined;
  public readonly FAUCET_GRANT_KOMBAT: number;

  public readonly NAMESPACE_API_KEY: string | undefined;
  public readonly ENS_PARENT_NAME: string;

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
    // Short by design: the refresh token carries session longevity.
    this.JWT_EXPIRES_IN = this.configService.get('JWT_EXPIRES_IN') ?? '2d';
    this.REFRESH_TOKEN_EXPIRES_IN_DAYS = parseInt(
      this.configService.get('REFRESH_TOKEN_EXPIRES_IN_DAYS') ?? '30',
      10,
    );
    this.REDIS_URL = this.configService.get('REDIS_URL');
    this.RESEND_API_KEY = this.configService.get('RESEND_API_KEY');
    this.ADMIN_TOKEN = this.configService.get('ADMIN_TOKEN');
    this.BOT_SECRET = this.configService.get('BOT_SECRET');
    this.EMAIL_FROM =
      this.configService.get('EMAIL_FROM') ?? 'login@gaming-platform.local';
    this.IS_PRODUCTION = isProductionEnv(this.configService.get('NODE_ENV'));

    this.DEMO_LOGIN_EMAIL = (
      this.configService.get('DEMO_LOGIN_EMAIL') ?? 'demo@playkombat.xyz'
    )
      .trim()
      .toLowerCase();
    this.DEMO_LOGIN_CODE = this.configService.get('DEMO_LOGIN_CODE');

    this.SIWE_DOMAINS = (this.configService.get('SIWE_DOMAINS') ?? '')
      .split(',')
      .map((d: string) => d.trim().toLowerCase())
      .filter(Boolean);

    this.CHAIN_RPC_URL = this.configService.get('CHAIN_RPC_URL');
    this.CHAIN_ID = parseInt(
      this.configService.get('CHAIN_ID') ?? '11155111', // Sepolia
      10,
    );
    this.OPERATOR_PRIVATE_KEY = this.configService.get('OPERATOR_PRIVATE_KEY');
    // Validated at boot: a bad key found mid-signup would strand a user without a wallet.
    this.W_ENCRYPT = this.configService.get('W_ENCRYPT');
    if (this.W_ENCRYPT !== undefined) {
      parseEncryptionKey(this.W_ENCRYPT);
    }
    this.CHAIN_CONFIRMATIONS = parseInt(
      this.configService.get('CHAIN_CONFIRMATIONS') ?? '1',
      10,
    );
    this.STAKE_MAX = parseInt(
      this.configService.get('STAKE_MAX') ?? '1000',
      10,
    );
    this.WALLET_GAS_DUST_ETH =
      this.configService.get('WALLET_GAS_DUST_ETH') ?? '0.002';

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
    this.NAMESPACE_API_KEY = this.configService.get('NAMESPACE_API_KEY');
    this.ENS_PARENT_NAME =
      this.configService.get('ENS_PARENT_NAME') ?? 'playkombat.xyz';
  }
}
