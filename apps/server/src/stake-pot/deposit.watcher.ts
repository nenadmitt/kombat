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

/** Single-row cursor table. */
const CURSOR_ID = 1;

/**
 * Free-tier RPCs cap getLogs ranges; chunking also bounds how much a single
 * pass has to hold in memory when catching up from a cold cursor.
 */
const MAX_BLOCKS_PER_QUERY = 2_000n;

/**
 * Credits on-chain deposits into the ledger.
 *
 * Correctness rests on the confirmation lag (a reorg can't strand a credit for
 * a log that never happened) and on journal uniqueness (re-reading a range is a
 * no-op), not on the cursor. So the cursor is only an optimisation, and is
 * advanced only after a chunk is fully credited: a crash mid-chunk re-reads
 * rather than skips, the one direction that can't lose money.
 */
@Injectable()
export class DepositWatcher implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DepositWatcher.name);
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
      return; // Pot not configured - don't spin.
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

  /** One pass. Public so tests (and an admin endpoint) can drive it directly. */
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
        await this.creditRange(from, to);
        await this.saveCursor(to);
        from = to + 1n;
      }
    } catch (error) {
      // Leave the cursor where it is; the next tick retries the same range.
      this.logger.error(
        'Deposit scan failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.scanning = false;
    }
  }

  private async creditRange(from: bigint, to: bigint): Promise<void> {
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
        // Someone paid in for an address the platform doesn't know. The funds
        // are pooled but unattributed; reconciliation will report the drift.
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

  /** Created on first boot at STAKE_POT_DEPLOY_BLOCK, or at the current head
   *  when unset - accidentally scanning a whole chain is worse than needing
   *  the env var. */
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
