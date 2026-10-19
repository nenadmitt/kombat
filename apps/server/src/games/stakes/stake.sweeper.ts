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
// A live match keeps its state in the cache, which excludes it.
const STRANDED_FUNDED_MIN_AGE_MINUTES = 15;

// No staleness cutoff: Date.now() against a timestamp column skews by the DB timezone offset.
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
      return;
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

  // Public so tests can drive it deterministically.
  async sweep(): Promise<void> {
    if (this.sweeping) {
      return;
    }
    this.sweeping = true;
    try {
      const pending = await this.dbService.findMatchSettlementsByStatus(
        [
          SettlementStatus.Funding,
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
