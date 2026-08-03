import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { SettlementStatus } from '@gaming-platform/core';

import { DbService } from '../../db';
import { StakesService } from './stakes.service';

const SWEEP_INTERVAL_MS = 5_000;
const SWEEP_BATCH_LIMIT = 10;
/** Generous: a live match keeps its state in the cache, which excludes it. */
const STRANDED_FUNDED_MIN_AGE_MINUTES = 15;

/**
 * Recovers staked rooms orphaned mid-transition: Funding (the hold was never
 * taken), SettlePending/VoidPending (the settlement was claimed but the money
 * never moved), and stale Funded rooms whose match never got a deadline armed
 * because nobody entered.
 *
 * Both windows are microseconds wide - each is a database transaction that runs
 * inline - and both only open when the process dies inside one. Without
 * recovery the first leaves a room unplayable forever and the second leaves
 * every player's stake locked with nothing to release it. Cheap insurance for
 * the two windows that can strand money.
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
      const pending = await this.dbService.findMatchSettlementsByStatus(
        [
          SettlementStatus.Funding,
          // Claimed for settlement but never finished - the owner died between
          // taking the claim and moving the money, so the stake is still locked.
          SettlementStatus.SettlePending,
          SettlementStatus.VoidPending,
        ],
        SWEEP_BATCH_LIMIT,
      );
      for (const settlement of pending) {
        try {
          if (settlement.status === SettlementStatus.Funding) {
            await this.stakesService.recoverFunding(settlement.roomId);
          } else {
            await this.stakesService.recoverSettlement(settlement.roomId);
          }
        } catch (error) {
          this.logger.error(
            `Stake recovery failed for room ${settlement.roomId}`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }

      const stranded = await this.dbService.findStaleFundedSettlements(
        STRANDED_FUNDED_MIN_AGE_MINUTES,
      );
      for (const settlement of stranded) {
        try {
          await this.stakesService.recoverStrandedFunded(settlement.roomId);
        } catch (error) {
          this.logger.error(
            `Stranded-stake recovery failed for room ${settlement.roomId}`,
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
