import { Injectable, Logger } from '@nestjs/common';
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  padHex,
  type Address,
  type Chain,
  type Hex,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { StakeAsset } from '@gaming-platform/core';

import { CacheService } from '../cache';
import {
  OPERATOR_LOCK_KEY,
  OPERATOR_LOCK_TTL_MS,
  OPERATOR_RECEIPT_TIMEOUT_MS,
} from '../chain/chain.service';
import { ERC20_ABI } from '../chain/erc20.abi';
import { TOKEN_REGISTRY } from '../chain/token-registry';
import { ConfigurationService } from '../configuration/configuration.service';
import { ALREADY_PROCESSED_ERROR, STAKE_POT_ABI } from './stake-pot.abi';

const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';

const MAX_UINT256 = 2n ** 256n - 1n;

/** A decoded `Withdrawn` event. */
export type PotWithdrawal = {
  /** The uuid form, or null when the id was not minted by this server. */
  withdrawalId: string | null;
  to: Address;
  asset: StakeAsset;
  value: bigint;
  txHash: Hex;
  logIndex: number;
};

/** A decoded `Staked` event, resolved to the platform's own asset enum. */
export type StakedDeposit = {
  beneficiary: Address;
  asset: StakeAsset;
  value: bigint;
  txHash: Hex;
  logIndex: number;
  blockNumber: bigint;
};

/**
 * All on-chain access for the stake pot. Narrow by design: the server never
 * signs a deposit (the player's device does) and there is no per-user on-chain
 * state to read. Enabled only when the pot env group is fully configured.
 */
@Injectable()
export class StakePotChainService {
  private readonly logger = new Logger(StakePotChainService.name);

  readonly enabled: boolean;
  // Inferred client type - annotating viem's generic PublicClient directly
  // trips its structural-generics mismatch.
  private publicClient!: ReturnType<StakePotChainService['makePublicClient']>;
  private operatorAccount!: PrivateKeyAccount;
  private pot!: Address;
  private chain!: Chain;
  private tokens!: Partial<Record<StakeAsset, Address>>;
  /** Reverse of `tokens`, lowercased - deposit events name a token address. */
  private assetByAddress!: Map<string, StakeAsset>;
  /** Signup-grant signer. Separate from the operator so its blast radius is a
   *  small KC float, not the pot. Undefined when FAUCET_KEY is unset. */
  private faucetAccount?: PrivateKeyAccount;

  constructor(
    private readonly configurationService: ConfigurationService,
    private readonly cacheService: CacheService,
  ) {
    const c = configurationService;
    const registryTokens = TOKEN_REGISTRY.get(c.CHAIN_ID);
    this.enabled = Boolean(
      c.CHAIN_RPC_URL &&
        c.STAKE_POT_ADDRESS &&
        c.OPERATOR_PRIVATE_KEY &&
        registryTokens?.[StakeAsset.Kombat] &&
        registryTokens?.[StakeAsset.Usdc],
    );
    if (!this.enabled) {
      this.logger.warn(
        'Stake pot disabled: CHAIN_RPC_URL / STAKE_POT_ADDRESS / OPERATOR_PRIVATE_KEY not fully configured' +
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
    this.pot = c.STAKE_POT_ADDRESS as Address;
    this.tokens = {
      [StakeAsset.Native]: NATIVE_TOKEN_ADDRESS,
      ...registryTokens,
    };
    this.assetByAddress = new Map(
      Object.entries(this.tokens).map(([asset, address]) => [
        address.toLowerCase(),
        Number(asset) as StakeAsset,
      ]),
    );
    if (c.FAUCET_KEY) {
      this.faucetAccount = privateKeyToAccount(c.FAUCET_KEY as Hex);
      this.logger.log(`Signup faucet: ${this.faucetAccount.address}`);
    }
    this.logger.log(
      `Stake pot enabled: chain ${c.CHAIN_ID}, pot ${this.pot}, operator ${this.operatorAccount.address}`,
    );
  }

  get address(): Address {
    return this.pot;
  }

  /** Whether this asset has a token on the configured chain. */
  hasToken(asset: StakeAsset): boolean {
    return this.tokens[asset] !== undefined;
  }

  tokenAddress(asset: StakeAsset): Address {
    const token = this.tokens[asset];
    if (!token) {
      throw new Error(
        `No token for asset ${asset} on chain ${this.configurationService.CHAIN_ID}`,
      );
    }
    return token;
  }

  /** The withdrawal row's uuid as the contract's bytes32 id. */
  withdrawalIdToBytes32(id: string): Hex {
    return padHex(`0x${id.replace(/-/g, '')}`, { size: 32 });
  }

  /**
   * Inverse of `withdrawalIdToBytes32`, or null when the id cannot have come
   * from a withdrawal row - the owner picks its own ids when sweeping directly.
   */
  bytes32ToWithdrawalId(value: Hex): string | null {
    const hex = value.slice(2).toLowerCase();
    if (hex.length !== 64 || !/^0{32}[0-9a-f]{32}$/.test(hex)) {
      return null;
    }
    const uuid = hex.slice(32);
    return [
      uuid.slice(0, 8),
      uuid.slice(8, 12),
      uuid.slice(12, 16),
      uuid.slice(16, 20),
      uuid.slice(20),
    ].join('-');
  }

  // ---- reads ---------------------------------------------------------------

  getLatestBlock(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  /** Decoded `Staked` events in an inclusive block range. Unrecognised tokens
   *  are dropped with a warning; reconciliation surfaces the drift. */
  async getDeposits(fromBlock: bigint, toBlock: bigint): Promise<StakedDeposit[]> {
    const logs = await this.publicClient.getContractEvents({
      address: this.pot,
      abi: STAKE_POT_ABI,
      eventName: 'Staked',
      fromBlock,
      toBlock,
    });

    const deposits: StakedDeposit[] = [];
    for (const log of logs) {
      const { beneficiary, token, value } = log.args;
      if (!beneficiary || !token || value === undefined) {
        this.logger.warn(`Skipping malformed Staked log in ${log.transactionHash}`);
        continue;
      }
      const asset = this.assetByAddress.get(token.toLowerCase());
      if (asset === undefined) {
        this.logger.warn(
          `Staked event for unknown token ${token} in ${log.transactionHash} - not credited`,
        );
        continue;
      }
      deposits.push({
        beneficiary,
        asset,
        value,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
        blockNumber: log.blockNumber,
      });
    }
    return deposits;
  }

  /**
   * Decoded `Withdrawn` events in an inclusive block range. Covers both the
   * operator's payouts and the owner's direct sweeps - they are the same event.
   */
  async getWithdrawals(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<PotWithdrawal[]> {
    const logs = await this.publicClient.getContractEvents({
      address: this.pot,
      abi: STAKE_POT_ABI,
      eventName: 'Withdrawn',
      fromBlock,
      toBlock,
    });

    const withdrawals: PotWithdrawal[] = [];
    for (const log of logs) {
      const { withdrawalId, to, token, value } = log.args;
      if (!withdrawalId || !to || !token || value === undefined) {
        this.logger.warn(
          `Skipping malformed Withdrawn log in ${log.transactionHash}`,
        );
        continue;
      }
      const asset = this.assetByAddress.get(token.toLowerCase());
      if (asset === undefined) {
        this.logger.warn(
          `Withdrawn event for unknown token ${token} in ${log.transactionHash}`,
        );
        continue;
      }
      withdrawals.push({
        withdrawalId: this.bytes32ToWithdrawalId(withdrawalId),
        to,
        asset,
        value,
        txHash: log.transactionHash,
        logIndex: log.logIndex,
      });
    }
    return withdrawals;
  }

  /** The sweeper's answer to "did my transaction land before I crashed?" -
   *  cheaper and more reliable than hunting for a receipt. */
  isWithdrawalProcessed(withdrawalId: string): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.pot,
      abi: STAKE_POT_ABI,
      functionName: 'processedWithdrawals',
      args: [this.withdrawalIdToBytes32(withdrawalId)],
    });
  }

  /** Pooled holdings for one asset - the chain side of reconciliation. */
  getHoldings(asset: StakeAsset): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.pot,
      abi: STAKE_POT_ABI,
      functionName: 'holdings',
      args: [this.tokenAddress(asset)],
    });
  }

  isPaused(): Promise<boolean> {
    return this.publicClient.readContract({
      address: this.pot,
      abi: STAKE_POT_ABI,
      functionName: 'paused',
    });
  }

  /** Receipt status for a tx the sweeper already sent, or null if not mined. */
  async getTransactionStatus(
    hash: Hex,
  ): Promise<'success' | 'reverted' | null> {
    try {
      const receipt = await this.publicClient.getTransactionReceipt({ hash });
      return receipt.status;
    } catch {
      // Not mined yet (or dropped) - the caller falls back to the contract's
      // own idempotency record, which is authoritative either way.
      return null;
    }
  }

  // ---- writes --------------------------------------------------------------

  /** Runs under the shared operator lock, so pot payouts and any remaining
   *  other operator traffic stay on one nonce stream. */
  async withdrawTo(args: {
    withdrawalId: string;
    to: Address;
    asset: StakeAsset;
    amount: bigint;
  }): Promise<Hex> {
    return this.cacheService.withLock(
      OPERATOR_LOCK_KEY,
      OPERATOR_LOCK_TTL_MS,
      async () => {
        const client = createWalletClient({
          account: this.operatorAccount,
          chain: this.chain,
          transport: http(this.configurationService.CHAIN_RPC_URL),
        });
        const hash = await client.writeContract({
          address: this.pot,
          abi: STAKE_POT_ABI,
          functionName: 'withdrawTo',
          args: [
            this.withdrawalIdToBytes32(args.withdrawalId),
            args.to,
            this.tokenAddress(args.asset),
            args.amount,
          ],
          chain: this.chain,
          account: this.operatorAccount,
        });
        const receipt = await this.publicClient.waitForTransactionReceipt({
          hash,
          confirmations: this.configurationService.CHAIN_CONFIRMATIONS,
          timeout: OPERATOR_RECEIPT_TIMEOUT_MS,
        });
        if (receipt.status !== 'success') {
          throw new Error(`Withdrawal transaction ${hash} reverted`);
        }
        return hash;
      },
    );
  }

  // ---- signup faucet -------------------------------------------------------

  get faucetEnabled(): boolean {
    return this.enabled && this.faucetAccount !== undefined;
  }

  get faucetAddress(): Address | undefined {
    return this.faucetAccount?.address;
  }

  /**
   * Pay a grant straight into `beneficiary`'s pot, signed by the faucet wallet.
   *
   * The faucet writes no balances itself: this emits the ordinary `Staked`
   * event, so the watcher credits it exactly like a player's own deposit,
   * idempotency and reconciliation included.
   *
   * Not under the operator lock - a different signer means a separate nonce
   * stream, so it cannot collide with pot payouts.
   */
  async grantIntoPot(args: {
    beneficiary: Address;
    asset: StakeAsset;
    amount: bigint;
  }): Promise<Hex> {
    const account = this.faucetAccount;
    if (!account) {
      throw new Error('Faucet is not configured (FAUCET_KEY unset)');
    }
    const token = this.tokenAddress(args.asset);
    if (token === NATIVE_TOKEN_ADDRESS) {
      throw new Error('Native grants are not supported');
    }
    const client = createWalletClient({
      account,
      chain: this.chain,
      transport: http(this.configurationService.CHAIN_RPC_URL),
    });

    await this.ensureFaucetAllowance(client, account, token, args.amount);

    // No receipt wait: the claim endpoint returns the hash immediately and
    // the deposit watcher credits the pot when the Staked event lands.
    return client.writeContract({
      address: this.pot,
      abi: STAKE_POT_ABI,
      functionName: 'stake',
      args: [args.beneficiary, token, args.amount],
      chain: this.chain,
      account,
    });
  }

  /** Faucet token float, so an empty faucet can be reported before it bites. */
  faucetBalance(asset: StakeAsset): Promise<bigint> {
    const account = this.faucetAccount;
    if (!account) {
      return Promise.resolve(0n);
    }
    return this.publicClient.readContract({
      address: this.tokenAddress(asset),
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account.address],
    });
  }

  /** One-time unlimited approval from the faucet to the pot, per token. */
  private async ensureFaucetAllowance(
    client: ReturnType<typeof createWalletClient>,
    account: PrivateKeyAccount,
    token: Address,
    minRequired: bigint,
  ): Promise<void> {
    const allowance = await this.publicClient.readContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account.address, this.pot],
    });
    if (allowance >= minRequired) {
      return;
    }
    const hash = await client.writeContract({
      address: token,
      abi: ERC20_ABI,
      functionName: 'approve',
      args: [this.pot, MAX_UINT256],
      chain: this.chain,
      account,
    });
    await this.publicClient.waitForTransactionReceipt({ hash });
    this.logger.log(`Faucet approved the pot for ${token} (tx ${hash})`);
  }

  /** The contract refusing a replay is not a failure: the original payout
   *  already happened, so the caller should confirm. */
  isAlreadyProcessedError(error: unknown): boolean {
    if (error instanceof BaseError) {
      const revert = error.walk(
        err => err instanceof ContractFunctionRevertedError,
      );
      if (
        revert instanceof ContractFunctionRevertedError &&
        revert.data?.errorName === ALREADY_PROCESSED_ERROR
      ) {
        return true;
      }
    }
    // Simulation happens before the send, so the revert can also surface as a
    // plain message from the node.
    const message = error instanceof Error ? error.message : String(error);
    return message.includes(ALREADY_PROCESSED_ERROR);
  }

  private makePublicClient(chain: Chain) {
    return createPublicClient({
      chain,
      transport: http(this.configurationService.CHAIN_RPC_URL),
    });
  }
}
