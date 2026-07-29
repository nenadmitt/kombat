import {
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
 * Recovers staked rooms orphaned in Funding.
 *
 * Holding a stake is a database transaction that runs inline, so Funding lasts
 * microseconds - except when the process dies between writing the escrow row
 * and taking the hold. Without recovery that room is unplayable forever, and a
 * crash the other way round would leave holds locked with nothing to release
 * them. Cheap insurance for the one window that can strand money.
 *
 * No staleness window, deliberately: colliding with a live `beginFunding` is
 * harmless because both calls serialize on the same balance rows and the hold
 * is idempotent per (room, player). A cutoff would mean comparing `Date.now()`
 * against a `timestamp` column, which skews by the database/process timezone
 * offset (see bugs-and-inconsistencies/SERVER.BAI.md).
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

  /** One pass. Public so tests can drive it deterministically. */
  async sweep(): Promise<void> {
    if (this.sweeping) {
      return;
    }
    this.sweeping = true;
    try {
      const pending = await this.dbService.findStakeEscrowsByStatus(
        [EscrowStatus.Funding],
        SWEEP_BATCH_LIMIT,
      );
      for (const escrow of pending) {
        try {
          await this.stakesService.recoverFunding(escrow.roomId);
        } catch (error) {
          this.logger.error(
            `Funding recovery failed for room ${escrow.roomId}`,
            error instanceof Error ? error.stack : String(error),
          );
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
