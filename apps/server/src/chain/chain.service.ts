import { Injectable, Logger } from '@nestjs/common';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseSignature,
  stringToBytes,
  type Address,
  type Chain,
  type Hex,
} from 'viem';
import { privateKeyToAccount, type PrivateKeyAccount } from 'viem/accounts';
import { StakeAsset } from '@gaming-platform/core';

import { CacheService } from '../cache';
import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { WalletEncryptionService } from '../wallets/wallet-encryption.service';
import { ERC20_ABI, ESCROW_ABI, OnChainStakeState } from './escrow.abi';

/** EIP-2612 permit signature, shaped for the escrow's PermitSig tuple. */
export type PermitSignature = {
  deadline: bigint;
  v: number;
  r: Hex;
  s: Hex;
};

/** Serializes every operator tx — one nonce stream, one sender. */
const OPERATOR_LOCK_KEY = 'chain:operator';
const OPERATOR_LOCK_TTL_MS = 120_000;

/** Permit validity window — generous; funding retries reuse fresh ones anyway. */
const PERMIT_TTL_SECONDS = 30 * 60;

/**
 * All on-chain access: viem clients, the operator hot signer, and signing as
 * players (permits, native-ETH funding) via their custodial keys. Staking is
 * enabled only when the chain env group is fully configured — everything
 * else in the app works without it (free games).
 */
@Injectable()
export class ChainService {
  private readonly logger = new Logger(ChainService.name);

  readonly enabled: boolean;
  // Inferred client types — annotating viem's generic PublicClient directly
  // trips its structural-generics mismatch.
  private publicClient!: ReturnType<ChainService['makePublicClient']>;
  private operatorAccount!: PrivateKeyAccount;
  private escrow!: Address;
  private tokens!: Record<StakeAsset, Address | null>;
  private chain!: Chain;

  constructor(
    private readonly configurationService: ConfigurationService,
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
    private readonly walletEncryptionService: WalletEncryptionService,
  ) {
    const c = configurationService;
    this.enabled = Boolean(
      c.CHAIN_RPC_URL &&
        c.ESCROW_ADDRESS &&
        c.KOMBAT_ADDRESS &&
        c.USDC_ADDRESS &&
        c.OPERATOR_PRIVATE_KEY,
    );
    if (!this.enabled) {
      this.logger.warn(
        'Staking disabled: CHAIN_RPC_URL / ESCROW_ADDRESS / KOMBAT_ADDRESS / USDC_ADDRESS / OPERATOR_PRIVATE_KEY not fully configured',
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
    this.operatorAccount = privateKeyToAccount(
      c.OPERATOR_PRIVATE_KEY as Hex,
    );
    this.escrow = c.ESCROW_ADDRESS as Address;
    this.tokens = {
      [StakeAsset.Native]: null,
      [StakeAsset.Kombat]: c.KOMBAT_ADDRESS as Address,
      [StakeAsset.Usdc]: c.USDC_ADDRESS as Address,
    };
    this.logger.log(
      `Staking enabled: chain ${c.CHAIN_ID}, escrow ${this.escrow}, operator ${this.operatorAccount.address}`,
    );
  }

  /** The escrow's bytes32 match id for a room uuid. */
  matchIdFor(roomId: string): Hex {
    return keccak256(stringToBytes(roomId));
  }

  /** Zero address for native ETH, ERC20 address otherwise. */
  tokenAddress(asset: StakeAsset): Address {
    return this.tokens[asset] ?? '0x0000000000000000000000000000000000000000';
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

  // ---- player signing -----------------------------------------------------

  /** Decrypt a user's custodial key into a viem account (never logged). */
  private async playerAccount(userId: string): Promise<PrivateKeyAccount> {
    const wallet = await this.dbService.findWalletWithKeyForUser(userId);
    if (!wallet) {
      throw new Error(`User ${userId} has no wallet`);
    }
    return privateKeyToAccount(
      this.walletEncryptionService.decrypt(wallet.key) as Hex,
    );
  }

  /** Sign an EIP-2612 permit as the player (off-chain — free, no gas). */
  async signPermitAs(
    userId: string,
    asset: StakeAsset,
    amount: bigint,
  ): Promise<PermitSignature> {
    const token = this.tokens[asset];
    if (!token) {
      throw new Error('Native ETH has no permit');
    }
    const account = await this.playerAccount(userId);
    const [name, nonce] = await Promise.all([
      this.publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'name',
      }),
      this.publicClient.readContract({
        address: token,
        abi: ERC20_ABI,
        functionName: 'nonces',
        args: [account.address],
      }),
    ]);
    const deadline = BigInt(
      Math.floor(Date.now() / 1000) + PERMIT_TTL_SECONDS,
    );
    const signature = await account.signTypedData({
      domain: {
        name,
        version: '1', // OZ ERC20Permit
        chainId: this.configurationService.CHAIN_ID,
        verifyingContract: token,
      },
      types: {
        Permit: [
          { name: 'owner', type: 'address' },
          { name: 'spender', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'nonce', type: 'uint256' },
          { name: 'deadline', type: 'uint256' },
        ],
      },
      primaryType: 'Permit',
      message: {
        owner: account.address,
        spender: this.escrow,
        value: amount,
        nonce,
        deadline,
      },
    });
    const parsed = parseSignature(signature);
    return {
      deadline,
      v: Number(parsed.v ?? BigInt(parsed.yParity + 27)),
      r: parsed.r,
      s: parsed.s,
    };
  }

  /** The player's wallet address (no key material leaves this module). */
  async playerAddress(userId: string): Promise<Address> {
    const [wallet] = await this.dbService.findWalletsForUser(userId);
    if (!wallet) {
      throw new Error(`User ${userId} has no wallet`);
    }
    return wallet.address as Address;
  }

  private makePublicClient(chain: Chain) {
    return createPublicClient({ chain, transport: http() });
  }

  // ---- escrow reads -------------------------------------------------------

  async getStakeState(matchId: Hex): Promise<{
    state: OnChainStakeState;
    player1Funded: boolean;
    player2Funded: boolean;
  }> {
    const s = await this.publicClient.readContract({
      address: this.escrow,
      abi: ESCROW_ABI,
      functionName: 'stakes',
      args: [matchId],
    });
    return { state: s[5] as OnChainStakeState, player1Funded: s[6], player2Funded: s[7] };
  }

  async getFeeBps(): Promise<number> {
    return this.publicClient.readContract({
      address: this.escrow,
      abi: ESCROW_ABI,
      functionName: 'feeBps',
    });
  }

  // ---- escrow writes ------------------------------------------------------

  /** One operator tx: create the match and pull both permits (USDC/KOMBAT). */
  openWithPermits(args: {
    matchId: Hex;
    player1: Address;
    player2: Address;
    asset: StakeAsset;
    amount: bigint;
    sig1: PermitSignature;
    sig2: PermitSignature;
  }): Promise<Hex> {
    return this.asOperator(client =>
      client.writeContract({
        address: this.escrow,
        abi: ESCROW_ABI,
        functionName: 'openWithPermits',
        args: [
          args.matchId,
          args.player1,
          args.player2,
          this.tokenAddress(args.asset),
          args.amount,
          args.sig1,
          args.sig2,
        ],
        chain: this.chain,
        account: this.operatorAccount,
      }),
    );
  }

  createMatch(args: {
    matchId: Hex;
    player1: Address;
    player2: Address;
    asset: StakeAsset;
    amount: bigint;
  }): Promise<Hex> {
    return this.asOperator(client =>
      client.writeContract({
        address: this.escrow,
        abi: ESCROW_ABI,
        functionName: 'createMatch',
        args: [
          args.matchId,
          args.player1,
          args.player2,
          this.tokenAddress(args.asset),
          args.amount,
        ],
        chain: this.chain,
        account: this.operatorAccount,
      }),
    );
  }

  /** Send a player's ETH stake from their own custodial wallet. */
  async fundNativeAs(userId: string, matchId: Hex, amount: bigint): Promise<Hex> {
    const account = await this.playerAccount(userId);
    const client = createWalletClient({
      account,
      chain: this.chain,
      transport: http(),
    });
    const hash = await client.writeContract({
      address: this.escrow,
      abi: ESCROW_ABI,
      functionName: 'fundNative',
      args: [matchId],
      value: amount,
      chain: this.chain,
      account,
    });
    await this.waitForSuccess(hash);
    return hash;
  }

  settleStake(matchId: Hex, winner: Address): Promise<Hex> {
    return this.asOperator(client =>
      client.writeContract({
        address: this.escrow,
        abi: ESCROW_ABI,
        functionName: 'settleStake',
        args: [matchId, winner],
        chain: this.chain,
        account: this.operatorAccount,
      }),
    );
  }

  voidStake(matchId: Hex): Promise<Hex> {
    return this.asOperator(client =>
      client.writeContract({
        address: this.escrow,
        abi: ESCROW_ABI,
        functionName: 'voidStake',
        args: [matchId],
        chain: this.chain,
        account: this.operatorAccount,
      }),
    );
  }

  // ---- internals ----------------------------------------------------------

  /**
   * Run one operator write under the shared lock (single nonce stream) and
   * wait for it to be confirmed successful before releasing.
   */
  private asOperator(
    fn: (client: ReturnType<typeof createWalletClient>) => Promise<Hex>,
  ): Promise<Hex> {
    return this.cacheService.withLock(
      OPERATOR_LOCK_KEY,
      OPERATOR_LOCK_TTL_MS,
      async () => {
        const client = createWalletClient({
          account: this.operatorAccount,
          chain: this.chain,
          transport: http(),
        });
        const hash = await fn(client);
        await this.waitForSuccess(hash);
        return hash;
      },
    );
  }

  private async waitForSuccess(hash: Hex): Promise<void> {
    const receipt = await this.publicClient.waitForTransactionReceipt({
      hash,
      confirmations: this.configurationService.CHAIN_CONFIRMATIONS,
    });
    if (receipt.status !== 'success') {
      throw new Error(`Transaction ${hash} reverted`);
    }
  }
}
