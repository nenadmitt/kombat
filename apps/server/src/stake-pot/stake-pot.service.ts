import { ConflictException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  STAKE_ASSETS,
  STAKE_ASSET_SYMBOLS,
  STAKE_POT_EVENTS,
  StakeAsset,
  StakeLedgerKind,
  StakeWithdrawalStatus,
  type StakePotAmounts,
  type StakePotBalances,
  type StakePotFeeSummary,
  type StakePotHistoryEntry,
  emptyStakePotAmounts,
} from '@gaming-platform/core';
import { DataSource, EntityManager, In, Repository } from 'typeorm';

import { ConfigurationService } from '../configuration/configuration.service';
import { WebsocketsService } from '../websockets';
import { StakeLedgerEntryEntity } from './entities/stake-ledger-entry.entity';
import { StakePotWithdrawalEntity } from './entities/stake-pot-withdrawal.entity';
import { StakedBalanceEntity } from './entities/staked-balance.entity';
import type { StakeLeg } from './stake-leg';

export type StakeSettlementTotals = {
  payoutByAsset: Record<string, string>;
  feeByAsset: Record<string, string>;
};

// Fixed uuid outside the generated space, so it can never collide with a real user.
export const PLATFORM_ACCOUNT_ID = '00000000-0000-0000-0000-00000000fee5';

const ALL_ASSETS: StakeAsset[] = STAKE_ASSETS;

const BPS_DENOMINATOR = 10_000n;

// Postgres row locks, not the cache locks: money can't tolerate an unavailable lock. Idempotency lives in the journal.
@Injectable()
export class StakePotService {
  private readonly logger = new Logger(StakePotService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(StakedBalanceEntity)
    private readonly balanceRepository: Repository<StakedBalanceEntity>,
    @InjectRepository(StakeLedgerEntryEntity)
    private readonly ledgerRepository: Repository<StakeLedgerEntryEntity>,
    @InjectRepository(StakePotWithdrawalEntity)
    private readonly withdrawalRepository: Repository<StakePotWithdrawalEntity>,
    private readonly configurationService: ConfigurationService,
    private readonly websocketsService: WebsocketsService,
  ) {}

  async availableBalance(userId: string, asset: StakeAsset): Promise<bigint> {
    const row = await this.balanceRepository.findOneBy({ userId, asset });
    return BigInt(row?.available ?? 0);
  }

  async getBalances(userId: string): Promise<StakePotBalances> {
    const [rows, inFlight] = await Promise.all([
      this.balanceRepository.findBy({ userId }),
      // Sent-but-unconfirmed still counts as pending to the user.
      this.withdrawalRepository.findBy({
        userId,
        status: In([StakeWithdrawalStatus.Pending, StakeWithdrawalStatus.Sent]),
      }),
    ]);

    const available = emptyStakePotAmounts();
    const locked = emptyStakePotAmounts();
    const pendingWithdrawals = emptyStakePotAmounts();
    for (const row of rows) {
      available[row.asset] = BigInt(row.available).toString();
      locked[row.asset] = BigInt(row.locked).toString();
    }
    for (const withdrawal of inFlight) {
      pendingWithdrawals[withdrawal.asset] = (
        BigInt(pendingWithdrawals[withdrawal.asset]) + BigInt(withdrawal.amount)
      ).toString();
    }
    return { available, locked, pendingWithdrawals };
  }

  async getHistory(
    userId: string,
    limit: number,
  ): Promise<StakePotHistoryEntry[]> {
    const rows = await this.ledgerRepository.find({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
    });
    return rows.map(row => ({
      id: row.id,
      asset: row.asset,
      kind: row.kind,
      amount: BigInt(row.amount).toString(),
      roomId: row.roomId,
      txHash: row.txHash,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getLedgerTotals(): Promise<Record<StakeAsset, bigint>> {
    const rows = await this.balanceRepository
      .createQueryBuilder('balance')
      .select('balance.asset', 'asset')
      .addSelect('SUM(balance.available)', 'available')
      .addSelect('SUM(balance.locked)', 'locked')
      .groupBy('balance.asset')
      .getRawMany<{ asset: number; available: string; locked: string }>();

    const inFlight = await this.withdrawalRepository
      .createQueryBuilder('withdrawal')
      .select('withdrawal.asset', 'asset')
      .addSelect('SUM(withdrawal.amount)', 'amount')
      .where('withdrawal.status IN (:...statuses)', {
        statuses: [StakeWithdrawalStatus.Pending, StakeWithdrawalStatus.Sent],
      })
      .groupBy('withdrawal.asset')
      .getRawMany<{ asset: number; amount: string }>();

    const totals = Object.fromEntries(
      STAKE_ASSETS.map(asset => [asset, 0n]),
    ) as Record<StakeAsset, bigint>;
    for (const row of rows) {
      totals[Number(row.asset) as StakeAsset] +=
        this.toBigInt(row.available) + this.toBigInt(row.locked);
    }
    // A requested withdrawal has left `available` but not the contract.
    for (const row of inFlight) {
      totals[Number(row.asset) as StakeAsset] += this.toBigInt(row.amount);
    }
    return totals;
  }

  async credit(
    userId: string,
    asset: StakeAsset,
    amount: bigint,
    source: { txHash: string; logIndex: number },
  ): Promise<void> {
    if (amount <= 0n) {
      throw new Error(`Refusing to credit a non-positive amount: ${amount}`);
    }
    const credited = await this.dataSource.transaction(async manager => {
      const already = await manager.findOneBy(StakeLedgerEntryEntity, {
        txHash: source.txHash,
        logIndex: source.logIndex,
      });
      if (already) {
        return false;
      }
      const balance = await this.lockBalance(manager, userId, asset);
      const available = BigInt(balance.available) + amount;
      await this.writeBalance(manager, balance, { available });
      await this.appendEntry(manager, {
        userId,
        asset,
        kind: StakeLedgerKind.Deposit,
        amount,
        balanceAfter: available,
        txHash: source.txHash,
        logIndex: source.logIndex,
      });
      return true;
    });

    if (credited) {
      this.logger.log(
        `Credited ${amount} of asset ${asset} to ${userId} (${source.txHash}#${source.logIndex})`,
      );
      await this.pushBalances([userId]);
    }
  }

  // A withdrawal above the accrued fees is the owner rescuing player funds, so it is logged, not booked.
  async recordFeeSweep(
    asset: StakeAsset,
    amount: bigint,
    source: { txHash: string; logIndex: number },
  ): Promise<void> {
    await this.dataSource.transaction(async manager => {
      const already = await manager.findOneBy(StakeLedgerEntryEntity, {
        txHash: source.txHash,
        logIndex: source.logIndex,
      });
      if (already) {
        return;
      }
      const balance = await this.lockBalance(
        manager,
        PLATFORM_ACCOUNT_ID,
        asset,
      );
      const available = BigInt(balance.available);
      if (available < amount) {
        this.logger.error(
          `Out-of-band withdrawal of ${amount} (asset ${asset}) in ${source.txHash} ` +
            `exceeds accrued fees of ${available} - treating as a rescue, not a fee sweep`,
        );
        return;
      }
      const remaining = available - amount;
      await this.writeBalance(manager, balance, { available: remaining });
      await this.appendEntry(manager, {
        userId: PLATFORM_ACCOUNT_ID,
        asset,
        kind: StakeLedgerKind.FeeSweep,
        amount: -amount,
        balanceAfter: remaining,
        txHash: source.txHash,
        logIndex: source.logIndex,
      });
      this.logger.log(
        `Recorded fee sweep of ${amount} (asset ${asset}) in ${source.txHash}`,
      );
    });
  }

  async getFeeSummary(): Promise<StakePotFeeSummary[]> {
    const rows = await this.ledgerRepository
      .createQueryBuilder('entry')
      .select('entry.asset', 'asset')
      .addSelect('entry.kind', 'kind')
      .addSelect('SUM(entry.amount)', 'total')
      .where('entry.user_id = :userId', { userId: PLATFORM_ACCOUNT_ID })
      .andWhere('entry.kind IN (:...kinds)', {
        kinds: [StakeLedgerKind.Fee, StakeLedgerKind.FeeSweep],
      })
      .groupBy('entry.asset')
      .addGroupBy('entry.kind')
      .getRawMany<{ asset: number; kind: number; total: string }>();

    const balances = await this.balanceRepository.findBy({
      userId: PLATFORM_ACCOUNT_ID,
    });

    return ALL_ASSETS.map(asset => {
      const of = (kind: StakeLedgerKind) =>
        this.toBigInt(
          rows.find(r => Number(r.asset) === asset && Number(r.kind) === kind)
            ?.total ?? '0',
        );
      const claimable = BigInt(
        balances.find(b => b.asset === asset)?.available ?? 0,
      );
      return {
        asset,
        symbol: STAKE_ASSET_SYMBOLS[asset],
        accrued: of(StakeLedgerKind.Fee).toString(),
        // FeeSweep amounts are stored negative.
        swept: (-of(StakeLedgerKind.FeeSweep)).toString(),
        claimable: claimable.toString(),
      };
    });
  }

  // Participants who already hold for this room (a retried funding) are skipped, not charged twice.
  async holdForMatch(roomId: string, legs: StakeLeg[]): Promise<void> {
    const held = await this.dataSource.transaction(async manager => {
      const existing = await manager.find(StakeLedgerEntryEntity, {
        where: { roomId, kind: StakeLedgerKind.Hold },
      });
      const alreadyHeld = new Set(existing.map(entry => entry.userId));
      const pending = legs.filter(leg => !alreadyHeld.has(leg.userId));
      if (pending.length === 0) {
        return [];
      }

      for (const leg of this.orderedLegs(pending)) {
        const balance = await this.lockBalance(manager, leg.userId, leg.asset);
        const available = BigInt(balance.available);
        if (available < leg.amount) {
          throw new ConflictException(
            'Not enough in your stake pot for this match.',
          );
        }
        const remaining = available - leg.amount;
        await this.writeBalance(manager, balance, {
          available: remaining,
          locked: BigInt(balance.locked) + leg.amount,
        });
        await this.appendEntry(manager, {
          userId: leg.userId,
          asset: leg.asset,
          kind: StakeLedgerKind.Hold,
          amount: -leg.amount,
          balanceAfter: remaining,
          roomId,
        });
      }
      return pending.map(leg => leg.userId);
    });

    await this.pushBalances(held);
  }

  // Each asset settles on its own: no leg is converted, so the winner gets one prize per asset.
  async settleMatch(
    roomId: string,
    winnerUserId: string,
    expectedLegs: StakeLeg[],
  ): Promise<StakeSettlementTotals | null> {
    const result = await this.dataSource.transaction(async manager => {
      if (await this.roomHasEntry(manager, roomId, StakeLedgerKind.Capture)) {
        return null;
      }
      if (await this.roomHasEntry(manager, roomId, StakeLedgerKind.Release)) {
        this.logger.warn(
          `Refusing to settle room ${roomId}: its holds were already released`,
        );
        return null;
      }

      // The holds decide what is captured, never the caller's possibly stale copy of the room.
      const holds = await manager.find(StakeLedgerEntryEntity, {
        where: { roomId, kind: StakeLedgerKind.Hold },
      });
      const settling: StakeLeg[] = holds.length
        ? holds.map(hold => ({
            userId: hold.userId,
            asset: hold.asset,
            amount: -BigInt(hold.amount),
          }))
        : expectedLegs;

      const potByAsset = new Map<StakeAsset, bigint>();
      for (const leg of settling) {
        potByAsset.set(leg.asset, (potByAsset.get(leg.asset) ?? 0n) + leg.amount);
      }

      // Capture every hold first, the winner's included, so the arithmetic is the same for every participant.
      for (const leg of this.orderedLegs(settling)) {
        const balance = await this.lockBalance(manager, leg.userId, leg.asset);
        await this.writeBalance(manager, balance, {
          locked: BigInt(balance.locked) - leg.amount,
        });
        await this.appendEntry(manager, {
          userId: leg.userId,
          asset: leg.asset,
          kind: StakeLedgerKind.Capture,
          amount: -leg.amount,
          balanceAfter: BigInt(balance.available),
          roomId,
        });
      }

      const payoutByAsset: Record<string, string> = {};
      const feeByAsset: Record<string, string> = {};
      for (const asset of [...potByAsset.keys()].sort((a, b) => a - b)) {
        const pot = potByAsset.get(asset)!;
        const fee =
          (pot * BigInt(this.configurationService.STAKE_FEE_BPS)) /
          BPS_DENOMINATOR;
        const payout = pot - fee;
        payoutByAsset[asset] = payout.toString();
        feeByAsset[asset] = fee.toString();

        const winnerBalance = await this.lockBalance(
          manager,
          winnerUserId,
          asset,
        );
        const winnerAvailable = BigInt(winnerBalance.available) + payout;
        await this.writeBalance(manager, winnerBalance, {
          available: winnerAvailable,
        });
        await this.appendEntry(manager, {
          userId: winnerUserId,
          asset,
          kind: StakeLedgerKind.Prize,
          amount: payout,
          balanceAfter: winnerAvailable,
          roomId,
        });

        if (fee > 0n) {
          const platform = await this.lockBalance(
            manager,
            PLATFORM_ACCOUNT_ID,
            asset,
          );
          const platformAvailable = BigInt(platform.available) + fee;
          await this.writeBalance(manager, platform, {
            available: platformAvailable,
          });
          await this.appendEntry(manager, {
            userId: PLATFORM_ACCOUNT_ID,
            asset,
            kind: StakeLedgerKind.Fee,
            amount: fee,
            balanceAfter: platformAvailable,
            roomId,
          });
        }
      }
      return {
        payoutByAsset,
        feeByAsset,
        notify: settling.map(leg => leg.userId),
      };
    });

    if (!result) {
      return null;
    }
    await this.pushBalances(result.notify);
    return {
      payoutByAsset: result.payoutByAsset,
      feeByAsset: result.feeByAsset,
    };
  }

  async releaseMatch(roomId: string): Promise<void> {
    const released = await this.dataSource.transaction(async manager => {
      if (await this.roomHasEntry(manager, roomId, StakeLedgerKind.Capture)) {
        this.logger.warn(
          `Refusing to release room ${roomId}: it was already settled`,
        );
        return [];
      }
      const holds = await manager.find(StakeLedgerEntryEntity, {
        where: { roomId, kind: StakeLedgerKind.Hold },
      });
      const releases = await manager.find(StakeLedgerEntryEntity, {
        where: { roomId, kind: StakeLedgerKind.Release },
      });
      const alreadyReleased = new Set(releases.map(entry => entry.userId));
      const outstanding = holds.filter(
        hold => !alreadyReleased.has(hold.userId),
      );

      for (const hold of this.orderedBy(outstanding, hold => hold.userId)) {
        // A Hold's amount is the negated stake.
        const stake = -BigInt(hold.amount);
        const balance = await this.lockBalance(manager, hold.userId, hold.asset);
        const available = BigInt(balance.available) + stake;
        await this.writeBalance(manager, balance, {
          available,
          locked: BigInt(balance.locked) - stake,
        });
        await this.appendEntry(manager, {
          userId: hold.userId,
          asset: hold.asset,
          kind: StakeLedgerKind.Release,
          amount: stake,
          balanceAfter: available,
          roomId,
        });
      }
      return outstanding.map(hold => hold.userId);
    });

    await this.pushBalances(released);
  }

  async requestWithdrawal(
    userId: string,
    asset: StakeAsset,
    amount: bigint,
    toAddress: string,
  ): Promise<StakePotWithdrawalEntity> {
    if (amount <= 0n) {
      throw new ConflictException('Withdrawal amount must be positive.');
    }
    const withdrawal = await this.dataSource.transaction(async manager => {
      const balance = await this.lockBalance(manager, userId, asset);
      const available = BigInt(balance.available);
      if (available < amount) {
        throw new ConflictException(
          'Not enough available in your stake pot to withdraw that.',
        );
      }
      const remaining = available - amount;
      await this.writeBalance(manager, balance, { available: remaining });

      const row = await manager.save(
        manager.create(StakePotWithdrawalEntity, {
          userId,
          asset,
          amount: amount.toString(),
          toAddress,
          status: StakeWithdrawalStatus.Pending,
          attempts: 0,
        }),
      );
      await this.appendEntry(manager, {
        userId,
        asset,
        kind: StakeLedgerKind.WithdrawalRequest,
        amount: -amount,
        balanceAfter: remaining,
        withdrawalId: row.id,
      });
      return row;
    });

    await this.pushBalances([userId]);
    return withdrawal;
  }

  // Cutoff in SQL: comparing to Date.now() skews by the timezone offset and would resend every withdrawal.
  findSweepableWithdrawals(
    sentStaleSeconds: number,
    limit: number,
  ): Promise<StakePotWithdrawalEntity[]> {
    return this.withdrawalRepository
      .createQueryBuilder('withdrawal')
      .where('withdrawal.status = :pending', {
        pending: StakeWithdrawalStatus.Pending,
      })
      .orWhere(
        'withdrawal.status = :sent AND withdrawal.updated_at < now() - make_interval(secs => :sentStaleSeconds)',
        { sent: StakeWithdrawalStatus.Sent, sentStaleSeconds },
      )
      .orderBy('withdrawal.updated_at', 'ASC')
      .take(limit)
      .getMany();
  }

  async markWithdrawalSent(id: string, txHash: string): Promise<void> {
    await this.withdrawalRepository.update(
      { id },
      { status: StakeWithdrawalStatus.Sent, txHash, error: null },
    );
  }

  async markWithdrawalConfirmed(id: string, txHash?: string): Promise<void> {
    const withdrawal = await this.withdrawalRepository.findOneBy({ id });
    if (!withdrawal || withdrawal.status === StakeWithdrawalStatus.Confirmed) {
      return;
    }
    await this.withdrawalRepository.update(
      { id },
      {
        status: StakeWithdrawalStatus.Confirmed,
        error: null,
        ...(txHash ? { txHash } : {}),
      },
    );
    await this.pushBalances([withdrawal.userId]);
  }

  async recordWithdrawalFailure(
    id: string,
    error: unknown,
    maxAttempts: number,
  ): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    const refundedUser = await this.dataSource.transaction(async manager => {
      const withdrawal = await manager.findOneBy(StakePotWithdrawalEntity, {
        id,
      });
      if (
        !withdrawal ||
        withdrawal.status === StakeWithdrawalStatus.Confirmed ||
        withdrawal.status === StakeWithdrawalStatus.Failed
      ) {
        return null;
      }
      const attempts = withdrawal.attempts + 1;
      if (attempts < maxAttempts) {
        await manager.update(
          StakePotWithdrawalEntity,
          { id },
          { attempts, error: message },
        );
        return null;
      }

      const balance = await this.lockBalance(
        manager,
        withdrawal.userId,
        withdrawal.asset,
      );
      const amount = BigInt(withdrawal.amount);
      const available = BigInt(balance.available) + amount;
      await this.writeBalance(manager, balance, { available });
      await this.appendEntry(manager, {
        userId: withdrawal.userId,
        asset: withdrawal.asset,
        kind: StakeLedgerKind.WithdrawalRefund,
        amount,
        balanceAfter: available,
        withdrawalId: id,
      });
      await manager.update(
        StakePotWithdrawalEntity,
        { id },
        { status: StakeWithdrawalStatus.Failed, attempts, error: message },
      );
      return withdrawal.userId;
    });

    this.logger.error(`Withdrawal ${id} failed: ${message}`);
    if (refundedUser) {
      this.logger.warn(
        `Withdrawal ${id} gave up after ${maxAttempts} attempts - refunded to the pot`,
      );
      await this.pushBalances([refundedUser]);
    }
  }

  // Upsert, so two concurrent first-touches can't race to a duplicate key.
  private async lockBalance(
    manager: EntityManager,
    userId: string,
    asset: StakeAsset,
  ): Promise<StakedBalanceEntity> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(StakedBalanceEntity)
      .values({ userId, asset, available: '0', locked: '0' })
      .orIgnore()
      .execute();

    const rows = await manager
      .createQueryBuilder(StakedBalanceEntity, 'balance')
      .setLock('pessimistic_write')
      .where('balance.user_id = :userId AND balance.asset = :asset', {
        userId,
        asset,
      })
      .getMany();
    const row = rows[0];
    if (!row) {
      throw new Error(`Balance row for ${userId}/${asset} vanished`);
    }
    return row;
  }

  private async writeBalance(
    manager: EntityManager,
    balance: StakedBalanceEntity,
    next: { available?: bigint; locked?: bigint },
  ): Promise<void> {
    const patch: Partial<StakedBalanceEntity> = {};
    if (next.available !== undefined) {
      patch.available = next.available.toString();
    }
    if (next.locked !== undefined) {
      patch.locked = next.locked.toString();
    }
    await manager.update(StakedBalanceEntity, { id: balance.id }, patch);
    Object.assign(balance, patch);
  }

  private appendEntry(
    manager: EntityManager,
    entry: {
      userId: string;
      asset: StakeAsset;
      kind: StakeLedgerKind;
      amount: bigint;
      balanceAfter: bigint;
      roomId?: string;
      txHash?: string;
      logIndex?: number;
      withdrawalId?: string;
    },
  ): Promise<StakeLedgerEntryEntity> {
    return manager.save(
      manager.create(StakeLedgerEntryEntity, {
        userId: entry.userId,
        asset: entry.asset,
        kind: entry.kind,
        amount: entry.amount.toString(),
        balanceAfter: entry.balanceAfter.toString(),
        roomId: entry.roomId ?? null,
        txHash: entry.txHash ?? null,
        logIndex: entry.logIndex ?? null,
        withdrawalId: entry.withdrawalId ?? null,
      }),
    );
  }

  private async roomHasEntry(
    manager: EntityManager,
    roomId: string,
    kind: StakeLedgerKind,
  ): Promise<boolean> {
    const count = await manager.countBy(StakeLedgerEntryEntity, {
      roomId,
      kind,
    });
    return count > 0;
  }

  // Deterministic lock order is the deadlock guard for multi-player rooms.
  private orderedLegs(legs: StakeLeg[]): StakeLeg[] {
    return [...legs].sort((a, b) =>
      a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : a.asset - b.asset,
    );
  }

  private orderedBy<T>(items: T[], key: (item: T) => string): T[] {
    return [...items].sort((a, b) => key(a).localeCompare(key(b)));
  }

  // numeric() comes back as a string, sometimes with a fractional tail.
  private toBigInt(value: string | null): bigint {
    return BigInt(String(value ?? '0').split('.')[0] || '0');
  }

  // Best-effort, outside the transaction: a dropped push is caught up on the client's next refresh.
  private async pushBalances(userIds: string[]): Promise<void> {
    const recipients = [...new Set(userIds)].filter(
      userId => userId !== PLATFORM_ACCOUNT_ID,
    );
    await Promise.all(
      recipients.map(async userId => {
        try {
          const balances = await this.getBalances(userId);
          this.websocketsService.sendToUser(
            userId,
            STAKE_POT_EVENTS.balance,
            balances,
          );
        } catch (error) {
          this.logger.warn(
            `Failed to push pot balances to ${userId}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }),
    );
  }

  get assets(): StakeAsset[] {
    return ALL_ASSETS;
  }

  static emptyAmounts(): StakePotAmounts {
    return emptyStakePotAmounts();
  }
}
