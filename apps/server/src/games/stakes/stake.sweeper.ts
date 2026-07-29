import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EscrowStatus } from '@gaming-platform/core';

import { DbService } from '../../db';
import { StakesService } from './stakes.service';

const SWEEP_INTERVAL_MS = 5_000;
const SWEEP_BATCH_LIMIT = 10;
/**
 * A Funding row untouched this long is presumed orphaned (crash) and retried.
 * Must stay ABOVE the funding lock's TTL (FUNDING_LOCK_TTL_MS = 120s in
 * stakes.service): while a real funding job is still running it holds that
 * lock, so a shorter window here just makes the sweeper collide with a healthy
 * job. We only treat funding as orphaned once its lock could no longer exist.
 */
const FUNDING_STALE_MS = 130_000;

/**
 * Drains pending on-chain stake work from the stake_escrows table:
 * settlements, voids/refunds, and funding jobs orphaned by a crash or
 * restart. DB-status-driven (same philosophy as BattleshipDeadlineSweeper's
 * schedule): safe to run on every instance - each work item is re-validated
 * under the room's funding lock / against on-chain state, so double
 * processing degrades to a no-op.
 */
@Injectable()
export class StakeSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(StakeSweeper.name);
  private interval?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly dbService: DbService,
    private readonly stakesService: StakesService,
  ) {}

  onModuleInit(): void {
    // Asks StakesService rather than ChainService: in pot mode the escrow may
    // not be configured at all, yet a Funding row orphaned by a crash still
    // needs recovering (fundRoom honours the active mode).
    if (!this.stakesService.enabled) {
      return; // Staking disabled - nothing to sweep, don't spin.
    }
    this.interval = setInterval(() => {
      void this.sweep();
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async sweep(): Promise<void> {
    if (this.sweeping) {
      return; // Never stack sweeps (slow RPC, lock contention).
    }
    this.sweeping = true;
    try {
      const pending = await this.dbService.findStakeEscrowsByStatus(
        [EscrowStatus.SettlePending, EscrowStatus.VoidPending, EscrowStatus.Funding],
        SWEEP_BATCH_LIMIT,
      );
      for (const escrow of pending) {
        try {
          if (escrow.status === EscrowStatus.SettlePending) {
            await this.stakesService.settleEscrow(escrow.roomId);
          } else if (escrow.status === EscrowStatus.VoidPending) {
            await this.stakesService.voidEscrow(escrow.roomId);
          } else if (
            Date.now() - escrow.updatedAt.getTime() >
            FUNDING_STALE_MS
          ) {
            // Orphaned funding (e.g. server died mid-job) - fundRoom is
            // idempotent and re-checks on-chain state under the room lock.
            await this.stakesService.fundRoom(escrow.roomId);
          }
        } catch (error) {
          if (error instanceof ConflictException) {
            // The room lock is held by an in-flight action (e.g. funding still
            // working through its txs). Not a failure - this row is being
            // handled; leave it untouched and retry on the next sweep.
            this.logger.debug(
              `Room ${escrow.roomId} busy, skipping this sweep`,
            );
            continue;
          }
          await this.stakesService.recordSweepFailure(escrow.roomId, error);
        }
      }
    } catch (error) {
      this.logger.error(
        'Stake sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.sweeping = false;
    }
  }
}
