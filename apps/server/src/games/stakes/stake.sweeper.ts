import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { EscrowStatus } from '@gaming-platform/core';

import { ChainService } from '../../chain';
import { DbService } from '../../db';
import { StakesService } from './stakes.service';

const SWEEP_INTERVAL_MS = 5_000;
const SWEEP_BATCH_LIMIT = 10;
/** A Funding row untouched this long is presumed orphaned (crash) — retry it. */
const FUNDING_STALE_MS = 45_000;

/**
 * Drains pending on-chain stake work from the stake_escrows table:
 * settlements, voids/refunds, and funding jobs orphaned by a crash or
 * restart. DB-status-driven (same philosophy as BattleshipDeadlineSweeper's
 * schedule): safe to run on every instance — each work item is re-validated
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
    private readonly chainService: ChainService,
  ) {}

  onModuleInit(): void {
    if (!this.chainService.enabled) {
      return; // Staking disabled — nothing to sweep, don't spin.
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
            // Orphaned funding (e.g. server died mid-job) — fundRoom is
            // idempotent and re-checks on-chain state under the room lock.
            await this.stakesService.fundRoom(escrow.roomId);
          }
        } catch (error) {
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
