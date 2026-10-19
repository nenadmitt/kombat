import { Injectable, Logger } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseEther,
  type Address,
  type Chain,
  type Hex,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { STAKE_ASSETS, StakeAsset } from '@gaming-platform/core';

import { CacheService } from '../cache';
import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { ERC20_ABI } from './erc20.abi';
import { TOKEN_REGISTRY } from './token-registry';

// Shared with the stake-pot module: one operator key means one nonce stream and one lock.
export const OPERATOR_LOCK_KEY = 'chain:operator';
// Must time out before the operator lock expires, or a second tx can collide on the nonce.
export const OPERATOR_RECEIPT_TIMEOUT_MS = 180_000;
export const OPERATOR_LOCK_TTL_MS = 240_000;

@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);

  readonly enabled: boolean;
  // Inferred: annotating viem's PublicClient directly trips its structural-generics mismatch.
  private publicClient!: ReturnType<ChainService['makePublicClient']>;
  private operatorAccount!: PrivateKeyAccount;
  private tokens!: Record<StakeAsset, Address | null>;
  private chain!: Chain;

  constructor(
    private readonly configurationService: ConfigurationService,
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
  ) {
    const c = configurationService;
    const registryTokens = TOKEN_REGISTRY.get(c.CHAIN_ID);
    this.enabled = Boolean(
      c.CHAIN_RPC_URL && c.OPERATOR_PRIVATE_KEY && registryTokens,
    );
    if (!this.enabled) {
      this.logger.warn(
        'Chain access disabled: CHAIN_RPC_URL / OPERATOR_PRIVATE_KEY not fully configured' +
          (registryTokens
            ? ''
            : ` (and no token registry entry for chain ${c.CHAIN_ID})`),
      );
      return;
    }

    this.chain = defineChain({
      id: c.CHAIN_ID,
      name: `chain-${c.CHAIN_ID}`,
      nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
      rpcUrls: { default: { http: [c.CHAIN_RPC_URL!] } },
    });
    this.publicClient = this.makePublicClient(this.chain);
    this.operatorAccount = privateKeyToAccount(c.OPERATOR_PRIVATE_KEY as Hex);
    this.tokens = Object.fromEntries(
      STAKE_ASSETS.map(asset => [
        asset,
        asset === StakeAsset.Native ? null : (registryTokens![asset] ?? null),
      ]),
    ) as Record<StakeAsset, Address | null>;
    this.logger.log(
      `Chain access enabled: chain ${c.CHAIN_ID}, operator ${this.operatorAccount.address}`,
    );
  }

  async getBalances(address: Address): Promise<Record<StakeAsset, string>> {
    const entries = await Promise.all(
      STAKE_ASSETS.map(async asset => {
        if (asset === StakeAsset.Native) {
          const native = await this.publicClient.getBalance({ address });
          return [asset, native.toString()] as const;
        }
        const token = this.tokens[asset];
        if (!token) {
          return [asset, '0'] as const; // Not deployed on this chain.
        }
        const balance = await this.readBalance(token, address);
        return [asset, balance.toString()] as const;
      }),
    );
    return Object.fromEntries(entries) as Record<StakeAsset, string>;
  }

  private readBalance(token: Address, owner: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner],
    });
  }

  async playerAddress(userId: string): Promise<Address> {
    const [wallet] = await this.dbService.findWalletsForUser(userId);
    if (!wallet) {
      throw new Error(`User ${userId} has no wallet`);
    }
    return wallet.address as Address;
  }

  async fundGasFor(userId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }
    await this.ensureGasFor(await this.playerAddress(userId));
  }

  private async ensureGasFor(address: Address): Promise<void> {
    const dust = parseEther(this.configurationService.WALLET_GAS_DUST_ETH);
    const balance = await this.publicClient.getBalance({ address });
    if (balance >= dust / 2n) {
      return;
    }
    await this.cacheService.withLock(
      OPERATOR_LOCK_KEY,
      OPERATOR_LOCK_TTL_MS,
      async () => {
        const client = createWalletClient({
          account: this.operatorAccount,
          chain: this.chain,
          transport: http(this.configurationService.CHAIN_RPC_URL),
        });
        const hash = await client.sendTransaction({
          to: address,
          value: dust,
          chain: this.chain,
          account: this.operatorAccount,
        });
        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash,
          confirmations: this.configurationService.CHAIN_CONFIRMATIONS,
          timeout: OPERATOR_RECEIPT_TIMEOUT_MS,
        });
        if (receipt.status !== 'success') {
          throw new Error(`Gas top-up ${hash} reverted`);
        }
      },
    );
  }

  private makePublicClient(chain: Chain) {
    return createPublicClient({
      chain,
      transport: http(this.configurationService.CHAIN_RPC_URL),
    });
  }
}
