import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { StakePotCursorEntity } from './entities/stake-pot-cursor.entity';
import { StakePotChainService } from './stake-pot-chain.service';
import { StakePotService } from './stake-pot.service';

const CURSOR_ID = 1;

// Free-tier RPCs cap getLogs ranges.
const MAX_BLOCKS_PER_QUERY = 2_000n;

// The cursor is advanced only after a chunk is applied: a crash re-reads rather than skips.
@Injectable()
export class PotEventWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PotEventWatcher.name);
  private interval?: ReturnType<typeof setInterval>;
  private scanning = false;

  constructor(
    @InjectRepository(StakePotCursorEntity)
    private readonly cursorRepository: Repository<StakePotCursorEntity>,
    private readonly chainService: StakePotChainService,
    private readonly stakePotService: StakePotService,
    private readonly dbService: DbService,
    private readonly configurationService: ConfigurationService,
  ) {}

  onModuleInit(): void {
    if (!this.chainService.enabled) {
      return;
    }
    this.interval = setInterval(() => {
      void this.scan();
    }, this.configurationService.STAKE_POT_POLL_MS);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  async scan(): Promise<void> {
    if (this.scanning) {
      return; // Never stack scans behind a slow RPC.
    }
    this.scanning = true;
    try {
      const latest = await this.chainService.getLatestBlock();
      const confirmations = BigInt(
        this.configurationService.CHAIN_CONFIRMATIONS,
      );
      // Below this height a reorg could still take the log away.
      const safeHead = latest - confirmations;
      if (safeHead < 0n) {
        return;
      }

      const cursor = await this.loadCursor(latest);
      let from = BigInt(cursor.lastScannedBlock) + 1n;
      if (from > safeHead) {
        return;
      }

      while (from <= safeHead) {
        const to =
          from + MAX_BLOCKS_PER_QUERY - 1n < safeHead
            ? from + MAX_BLOCKS_PER_QUERY - 1n
            : safeHead;
        await this.creditDeposits(from, to);
        await this.recordExternalWithdrawals(from, to);
        await this.saveCursor(to);
        from = to + 1n;
      }
    } catch (error) {
      this.logger.error(
        'Deposit scan failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.scanning = false;
    }
  }

  private async creditDeposits(from: bigint, to: bigint): Promise<void> {
    const deposits = await this.chainService.getDeposits(from, to);
    if (deposits.length === 0) {
      return;
    }
    this.logger.log(
      `Found ${deposits.length} deposit(s) in blocks ${from}-${to}`,
    );

    for (const deposit of deposits) {
      const wallet = await this.dbService.findWalletByAddress(
        deposit.beneficiary,
      );
      if (!wallet) {
        // Pooled but unattributed; reconciliation reports the drift.
        this.logger.warn(
          `Deposit of ${deposit.value} (asset ${deposit.asset}) to unknown address ` +
            `${deposit.beneficiary} in ${deposit.txHash} - not credited`,
        );
        continue;
      }
      await this.stakePotService.credit(
        wallet.userId,
        deposit.asset,
        deposit.value,
        { txHash: deposit.txHash, logIndex: deposit.logIndex },
      );
    }
  }

  // Withdrawals with no server row came from ownerWithdrawTo, which bypasses the ledger.
  private async recordExternalWithdrawals(
    from: bigint,
    to: bigint,
  ): Promise<void> {
    const withdrawals = await this.chainService.getWithdrawals(from, to);
    for (const withdrawal of withdrawals) {
      if (withdrawal.withdrawalId) {
        // Already debited at request time; recording it again would double-count.
        continue;
      }
      await this.stakePotService.recordFeeSweep(
        withdrawal.asset,
        withdrawal.value,
        { txHash: withdrawal.txHash, logIndex: withdrawal.logIndex },
      );
    }
  }

  // Without a deploy block, start at the head: accidentally scanning a whole chain is worse.
  private async loadCursor(latest: bigint): Promise<StakePotCursorEntity> {
    const existing = await this.cursorRepository.findOneBy({ id: CURSOR_ID });
    if (existing) {
      return existing;
    }
    const configured = this.configurationService.STAKE_POT_DEPLOY_BLOCK;
    const start = configured !== undefined ? BigInt(configured) : latest;
    this.logger.log(`Initialising deposit cursor at block ${start}`);
    return this.cursorRepository.save(
      this.cursorRepository.create({
        id: CURSOR_ID,
        // Stored as "last scanned", so scanning starts at start + 1.
        lastScannedBlock: (start - 1n).toString(),
      }),
    );
  }

  private async saveCursor(block: bigint): Promise<void> {
    await this.cursorRepository.update(
      { id: CURSOR_ID },
      { lastScannedBlock: block.toString() },
    );
  }
}
