import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import {
  EscrowStatus,
  STAKE_ASSET_DECIMALS,
  STAKE_ASSET_MIN,
  STAKE_ASSET_SYMBOLS,
  STAKE_EVENTS,
  StakeAsset,
} from '@gaming-platform/core';
import type { Address, Hex } from 'viem';

import { CacheService } from '../../cache';
import { ChainService } from '../../chain';
import { OnChainStakeState } from '../../chain';
import { ConfigurationService } from '../../configuration/configuration.service';
import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { WebsocketsService } from '../../websockets';

/** Per-room funding lock — funding is idempotent but must not run twice at once. */
const fundingLockKey = (roomId: string) => `stake:fund:${roomId}`;
const FUNDING_LOCK_TTL_MS = 120_000;

/** Give up (void + refund) after this many funding attempts. */
const MAX_ATTEMPTS = 3;

/** ETH headroom a native staker must hold beyond the stake, for their own gas. */
const NATIVE_GAS_HEADROOM = 2_000_000_000_000_000n; // 0.002 ETH

/**
 * Stake lifecycle orchestration: validates stakes, escrows both players'
 * stakes when a room fills (async — the match start is gated on Funded),
 * and queues settlement / voiding for the StakeSweeper when a match ends.
 * Free rooms (stakeToken null) never touch any of this.
 */
@Injectable()
export class StakesService {
  private readonly logger = new Logger(StakesService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly chainService: ChainService,
    private readonly cacheService: CacheService,
    private readonly configurationService: ConfigurationService,
    private readonly websocketsService: WebsocketsService,
  ) {}

  // ---- validation ----------------------------------------------------------

  get enabled(): boolean {
    return this.chainService.enabled;
  }

  /** Bounds-check a stake (min per asset, env-configured max). */
  validateStake(asset: StakeAsset, amount: string): void {
    if (!this.enabled) {
      throw new BadRequestException('Staked games are not available right now.');
    }
    if (!/^\d+$/.test(amount)) {
      throw new BadRequestException('Invalid stake amount.');
    }
    const value = BigInt(amount);
    const min = BigInt(STAKE_ASSET_MIN[asset]);
    const max =
      BigInt(this.configurationService.STAKE_MAX) *
      10n ** BigInt(STAKE_ASSET_DECIMALS[asset]);
    const symbol = STAKE_ASSET_SYMBOLS[asset];
    if (value < min) {
      throw new BadRequestException(`Minimum stake not met for ${symbol}.`);
    }
    if (value > max) {
      throw new BadRequestException(
        `Stake exceeds the ${this.configurationService.STAKE_MAX} ${symbol} maximum.`,
      );
    }
  }

  /** Reject up front when the player can't cover the stake (+ gas for ETH). */
  async assertSufficientBalance(
    userId: string,
    asset: StakeAsset,
    amount: string,
  ): Promise<void> {
    const address = await this.chainService.playerAddress(userId);
    const balances = await this.chainService.getBalances(address);
    let required = BigInt(amount);
    if (asset === StakeAsset.Native) {
      required += NATIVE_GAS_HEADROOM;
    }
    if (BigInt(balances[asset]) < required) {
      throw new ConflictException(
        `Insufficient ${STAKE_ASSET_SYMBOLS[asset]} balance for this stake.`,
      );
    }
  }

  /** Match-start gate: a staked room is playable only once escrowed. */
  async assertRoomPlayable(room: GameRoomEntity): Promise<void> {
    if (room.stakeToken === null) {
      return;
    }
    const escrow = await this.dbService.findStakeEscrowByRoomId(room.id);
    if (!escrow || escrow.status === EscrowStatus.Funding) {
      throw new ConflictException('Stakes are still being secured.');
    }
    if (
      escrow.status === EscrowStatus.Failed ||
      escrow.status === EscrowStatus.VoidPending ||
      escrow.status === EscrowStatus.Voided
    ) {
      throw new ConflictException('Stake funding failed — the match was voided.');
    }
  }

  // ---- funding -------------------------------------------------------------

  /**
   * Both players just joined a staked room: record the escrow, notify both
   * players, and kick off the (async) on-chain funding. The caller returns
   * to the joiner immediately; `stake:funded` / `stake:failed` follow.
   */
  async beginFunding(room: GameRoomEntity): Promise<void> {
    await this.dbService.createStakeEscrow({
      roomId: room.id,
      matchId: this.chainService.matchIdFor(room.id),
      status: EscrowStatus.Funding,
    });
    this.notifyPlayers(room, STAKE_EVENTS.funding, { roomId: room.id });

    void this.fundRoom(room.id).catch(error => {
      this.logger.error(
        `Funding kickoff failed for room ${room.id}`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  /**
   * Escrow both stakes. Idempotent and retriable: safe to re-run after a
   * crash or from the sweeper — it re-reads the on-chain state and only does
   * what's still missing.
   */
  async fundRoom(roomId: string): Promise<void> {
    await this.cacheService.withLock(
      fundingLockKey(roomId),
      FUNDING_LOCK_TTL_MS,
      async () => {
        const escrow = await this.dbService.findStakeEscrowByRoomId(roomId);
        if (!escrow || escrow.status !== EscrowStatus.Funding) {
          return; // Already funded/failed elsewhere.
        }
        const room = await this.dbService.findGameRoomById(roomId);
        if (!room || room.stakeToken === null || !room.opponentId) {
          return;
        }

        try {
          const txHashes = await this.escrowStakes(room, escrow.matchId as Hex);
          await this.dbService.updateStakeEscrow(roomId, {
            status: EscrowStatus.Funded,
            fundTxHashes: [...escrow.fundTxHashes, ...txHashes],
            error: null,
          });
          this.notifyPlayers(room, STAKE_EVENTS.funded, { roomId });
          // The creator's app has been in "waiting" since it created the
          // room — this is the (delayed) signal that transfers it into the
          // match, mirroring the free-game flow.
          this.websocketsService.sendToUser(room.userId, 'game:opponent-joined', {
            roomId,
          });
        } catch (error) {
          await this.handleFundingFailure(room, escrow.attempts + 1, error);
        }
      },
    );
  }

  /** Run the token-appropriate funding path; returns the tx hashes. */
  private async escrowStakes(
    room: GameRoomEntity,
    matchId: Hex,
  ): Promise<string[]> {
    const asset = room.stakeToken!;
    const amount = BigInt(room.stakeAmount!);
    const [player1, player2] = await Promise.all([
      this.chainService.playerAddress(room.userId),
      this.chainService.playerAddress(room.opponentId!),
    ]);

    // Re-entry after a crash: the pot may already be escrowed.
    const onChain = await this.chainService.getStakeState(matchId);
    if (onChain.state === OnChainStakeState.Active) {
      return [];
    }

    if (asset === StakeAsset.Native) {
      return this.escrowNativeStakes(room, matchId, amount, onChain);
    }

    // ERC20 (USDC / KOMBAT): standing allowances are pre-approved at wallet
    // creation, so these are normally no-ops — then one operator tx pulls
    // both stakes. Sequential on purpose: a missing approval may need an
    // operator gas-dust tx, and the operator nonce lock is single-file.
    await this.chainService.ensureStakeApproval(room.userId, asset, amount);
    await this.chainService.ensureStakeApproval(room.opponentId!, asset, amount);
    const hash = await this.chainService.openWithApprovals({
      matchId,
      player1,
      player2,
      asset,
      amount,
    });
    return [hash];
  }

  /** ETH path: operator declares the match, then each wallet sends its stake. */
  private async escrowNativeStakes(
    room: GameRoomEntity,
    matchId: Hex,
    amount: bigint,
    onChain: { state: OnChainStakeState; player1Funded: boolean; player2Funded: boolean },
  ): Promise<string[]> {
    const hashes: string[] = [];
    let state = onChain;

    if (state.state === OnChainStakeState.None) {
      const [player1, player2] = await Promise.all([
        this.chainService.playerAddress(room.userId),
        this.chainService.playerAddress(room.opponentId!),
      ]);
      hashes.push(
        await this.chainService.createMatch({
          matchId,
          player1,
          player2,
          asset: StakeAsset.Native,
          amount,
        }),
      );
      state = { state: OnChainStakeState.Created, player1Funded: false, player2Funded: false };
    }

    if (!state.player1Funded) {
      hashes.push(await this.chainService.fundNativeAs(room.userId, matchId, amount));
    }
    if (!state.player2Funded) {
      hashes.push(
        await this.chainService.fundNativeAs(room.opponentId!, matchId, amount),
      );
    }
    return hashes;
  }

  private async handleFundingFailure(
    room: GameRoomEntity,
    attempts: number,
    error: unknown,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    this.logger.warn(
      `Funding attempt ${attempts}/${MAX_ATTEMPTS} failed for room ${room.id}: ${message}`,
    );
    if (attempts < MAX_ATTEMPTS) {
      // Stay in Funding — the sweeper retries stale rows.
      await this.dbService.updateStakeEscrow(room.id, {
        attempts,
        error: message,
      });
      return;
    }
    // Give up: void on-chain leftovers (sweeper drains it), void the room.
    await this.dbService.updateStakeEscrow(room.id, {
      status: EscrowStatus.VoidPending,
      attempts,
      error: message,
    });
    await this.dbService.completeGameRoom(room.id, {
      winnerUserId: null,
      endReason: 'stake-failed',
    });
    this.notifyPlayers(room, STAKE_EVENTS.failed, {
      roomId: room.id,
      reason: 'Stake funding failed — any escrowed funds are being refunded.',
    });
  }

  // ---- settlement ----------------------------------------------------------

  /**
   * A match reached its end state: persist the result on the room and queue
   * the on-chain settlement (winner) or void (no winner) for the sweeper.
   * The single funnel for every way a match can end.
   */
  async completeMatch(
    roomId: string,
    winnerUserId: string | null,
    endReason: string,
  ): Promise<void> {
    await this.dbService.completeGameRoom(roomId, { winnerUserId, endReason });

    const escrow = await this.dbService.findStakeEscrowByRoomId(roomId);
    if (!escrow) {
      return; // Free game.
    }
    if (
      escrow.status !== EscrowStatus.Funding &&
      escrow.status !== EscrowStatus.Funded
    ) {
      return; // Already queued / terminal.
    }
    await this.dbService.updateStakeEscrow(roomId, {
      status: winnerUserId ? EscrowStatus.SettlePending : EscrowStatus.VoidPending,
      attempts: 0,
      error: null,
    });
  }

  /** Sweeper work item: settle a finished staked match to its winner. */
  async settleEscrow(roomId: string): Promise<void> {
    const escrow = await this.dbService.findStakeEscrowByRoomId(roomId);
    const room = await this.dbService.findGameRoomById(roomId);
    if (!escrow || escrow.status !== EscrowStatus.SettlePending || !room?.winnerUserId) {
      return;
    }
    const matchId = escrow.matchId as Hex;

    // Crash between tx and DB write → the chain is the source of truth.
    const onChain = await this.chainService.getStakeState(matchId);
    if (onChain.state === OnChainStakeState.Settled) {
      await this.dbService.updateStakeEscrow(roomId, {
        status: EscrowStatus.Settled,
        error: null,
      });
      return;
    }
    if (onChain.state === OnChainStakeState.Voided) {
      await this.dbService.updateStakeEscrow(roomId, {
        status: EscrowStatus.Voided,
        error: null,
      });
      return;
    }

    const winner = (await this.chainService.playerAddress(
      room.winnerUserId,
    )) as Address;
    const hash = await this.chainService.settleStake(matchId, winner);

    const pot = BigInt(room.stakeAmount!) * 2n;
    const fee = (pot * BigInt(await this.chainService.getFeeBps())) / 10_000n;
    await this.dbService.updateStakeEscrow(roomId, {
      status: EscrowStatus.Settled,
      settleTx: hash,
      payout: (pot - fee).toString(),
      fee: fee.toString(),
      error: null,
    });
  }

  /** Sweeper work item: void/refund a staked match with no winner. */
  async voidEscrow(roomId: string): Promise<void> {
    const escrow = await this.dbService.findStakeEscrowByRoomId(roomId);
    if (!escrow || escrow.status !== EscrowStatus.VoidPending) {
      return;
    }
    const matchId = escrow.matchId as Hex;

    const onChain = await this.chainService.getStakeState(matchId);
    if (onChain.state === OnChainStakeState.None) {
      // Nothing ever landed on-chain — nothing to refund.
      await this.dbService.updateStakeEscrow(roomId, {
        status: EscrowStatus.Voided,
        error: null,
      });
      return;
    }
    if (
      onChain.state === OnChainStakeState.Voided ||
      onChain.state === OnChainStakeState.Settled
    ) {
      await this.dbService.updateStakeEscrow(roomId, {
        status:
          onChain.state === OnChainStakeState.Voided
            ? EscrowStatus.Voided
            : EscrowStatus.Settled,
        error: null,
      });
      return;
    }

    const hash = await this.chainService.voidStake(matchId);
    await this.dbService.updateStakeEscrow(roomId, {
      status: EscrowStatus.Voided,
      voidTx: hash,
      error: null,
    });
  }

  /** Record a sweeper failure; terminal Failed after MAX_ATTEMPTS. */
  async recordSweepFailure(roomId: string, error: unknown): Promise<void> {
    const escrow = await this.dbService.findStakeEscrowByRoomId(roomId);
    if (!escrow) {
      return;
    }
    const attempts = escrow.attempts + 1;
    const message = error instanceof Error ? error.message : String(error);
    await this.dbService.updateStakeEscrow(roomId, {
      attempts,
      error: message,
      // Players can still self-recover via the escrow's public 7-day
      // withdrawStake, so Failed is safe (if unfortunate) to park in.
      ...(attempts >= MAX_ATTEMPTS ? { status: EscrowStatus.Failed } : {}),
    });
    this.logger.error(
      `Stake sweep failed for room ${roomId} (attempt ${attempts}/${MAX_ATTEMPTS}): ${message}`,
    );
  }

  private notifyPlayers(
    room: GameRoomEntity,
    event: string,
    payload: unknown,
  ): void {
    // User rooms, not the game channel — players haven't necessarily entered
    // the match screen (and its channel) during funding.
    this.websocketsService.sendToUser(room.userId, event, payload);
    if (room.opponentId) {
      this.websocketsService.sendToUser(room.opponentId, event, payload);
    }
  }
}
