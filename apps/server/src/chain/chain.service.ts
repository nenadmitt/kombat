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
import { StakeAsset } from '@gaming-platform/core';

import { CacheService } from '../cache';
import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { ERC20_ABI } from './erc20.abi';
import { TOKEN_REGISTRY } from './token-registry';

/**
 * Serializes every operator tx - one nonce stream, one sender. Exported because
 * the stake-pot module signs with the same operator key and must share the
 * lock, not just take a similar one.
 */
export const OPERATOR_LOCK_KEY = 'chain:operator';
export const OPERATOR_LOCK_TTL_MS = 120_000;

/**
 * Wallet-facing chain reads and the operator's gas top-ups. Staking itself lives
 * in the stake-pot module; this is what is left over for the wallet screen.
 *
 * Note that nothing here decrypts a player's key. Deposits are signed on the
 * device and withdrawals by the operator, so the server no longer signs as a
 * user at all.
 */
@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);

  readonly enabled: boolean;
  // Inferred client type - annotating viem's generic PublicClient directly
  // trips its structural-generics mismatch.
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
    this.tokens = {
      [StakeAsset.Native]: null,
      [StakeAsset.Kombat]: registryTokens![StakeAsset.Kombat] ?? null,
      [StakeAsset.Usdc]: registryTokens![StakeAsset.Usdc] ?? null,
    };
    this.logger.log(
      `Chain access enabled: chain ${c.CHAIN_ID}, operator ${this.operatorAccount.address}`,
    );
  }

  // ---- balances -----------------------------------------------------------

  async getBalances(address: Address): Promise<Record<StakeAsset, string>> {
    const [native, kombat, usdc] = await Promise.all([
      this.publicClient.getBalance({ address }),
      this.readBalance(this.tokens[StakeAsset.Kombat]!, address),
      this.readBalance(this.tokens[StakeAsset.Usdc]!, address),
    ]);
    return {
      [StakeAsset.Native]: native.toString(),
      [StakeAsset.Kombat]: kombat.toString(),
      [StakeAsset.Usdc]: usdc.toString(),
    };
  }

  private readBalance(token: Address, owner: Address): Promise<bigint> {
    return this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [owner],
    });
  }

  /** The player's wallet address (no key material leaves the wallets module). */
  async playerAddress(userId: string): Promise<Address> {
    const [wallet] = await this.dbService.findWalletsForUser(userId);
    if (!wallet) {
      throw new Error(`User ${userId} has no wallet`);
    }
    return wallet.address as Address;
  }

  // ---- gas ----------------------------------------------------------------

  /**
   * Gas-dust a wallet so it can pay for a transaction of its own - the player's
   * first pot deposit, which their device signs. Without dust a brand-new
   * custodial wallet cannot fund its pot at all.
   */
  async fundGasFor(userId: string): Promise<void> {
    if (!this.enabled) {
      return;
    }
    await this.ensureGasFor(await this.playerAddress(userId));
  }

  private async ensureGasFor(address: Address): Promise<void> {
    const dust = parseEther(this.configurationService.WALLET_GAS_DUST_ETH);
    const balance = await this.publicClient.getBalance({ address });
    // Half a dust unit is comfortably more than one transaction costs.
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
