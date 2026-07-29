import {
  ConflictException,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { StakeWithdrawalStatus } from '@gaming-platform/core';
import type { Address, Hex } from 'viem';

import { StakePotWithdrawalEntity } from './entities/stake-pot-withdrawal.entity';
import { StakePotChainService } from './stake-pot-chain.service';
import { StakePotService } from './stake-pot.service';

const SWEEP_INTERVAL_MS = 5_000;
const SWEEP_BATCH_LIMIT = 10;

/** Give up (and refund) after this many attempts. */
const MAX_ATTEMPTS = 3;

/**
 * A Sent row untouched this long is re-examined. Must stay above the operator
 * lock's TTL (OPERATOR_LOCK_TTL_MS = 120s): while a real send is still
 * in flight it holds that lock, and a shorter window would only make the
 * sweeper fight a healthy job.
 */
const SENT_STALE_MS = 130_000;

/**
 * Drains the withdrawal queue.
 *
 * Chain-state-first, like the escrow sweeper: every row starts by asking the
 * contract whether this id already paid. That one question covers every crash
 * window, because `processedWithdrawals` is written atomically by the payout
 * itself. Safe on every instance - the operator lock serialises the sends.
 */
@Injectable()
export class WithdrawalSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WithdrawalSweeper.name);
  private interval?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly stakePotService: StakePotService,
    private readonly chainService: StakePotChainService,
  ) {}

  onModuleInit(): void {
    if (!this.chainService.enabled) {
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

  /** One pass. Public so tests can drive it deterministically. */
  async sweep(): Promise<void> {
    if (this.sweeping) {
      return;
    }
    this.sweeping = true;
    try {
      const pending = await this.stakePotService.findSweepableWithdrawals(
        SENT_STALE_MS / 1000,
        SWEEP_BATCH_LIMIT,
      );
      for (const withdrawal of pending) {
        try {
          if (withdrawal.status === StakeWithdrawalStatus.Sent) {
            await this.reviewSent(withdrawal);
          } else {
            await this.execute(withdrawal);
          }
        } catch (error) {
          if (error instanceof ConflictException) {
            // The operator lock is held by another job - not a failure. Leave
            // the row for the next sweep rather than burning an attempt.
            this.logger.debug(
              `Operator busy, deferring withdrawal ${withdrawal.id}`,
            );
            continue;
          }
          if (this.chainService.isAlreadyProcessedError(error)) {
            // Our own earlier attempt landed after all.
            this.logger.warn(
              `Withdrawal ${withdrawal.id} was already paid on-chain - confirming`,
            );
            await this.stakePotService.markWithdrawalConfirmed(withdrawal.id);
            continue;
          }
          await this.stakePotService.recordWithdrawalFailure(
            withdrawal.id,
            error,
            MAX_ATTEMPTS,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Withdrawal sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.sweeping = false;
    }
  }

  /** The pre-flight check is what makes this safe after a crash: if an earlier
   *  attempt landed but its DB write didn't, confirm instead of paying twice. */
  private async execute(withdrawal: StakePotWithdrawalEntity): Promise<void> {
    if (await this.chainService.isWithdrawalProcessed(withdrawal.id)) {
      this.logger.warn(
        `Withdrawal ${withdrawal.id} already processed on-chain - confirming without resending`,
      );
      await this.stakePotService.markWithdrawalConfirmed(withdrawal.id);
      return;
    }

    const hash = await this.chainService.withdrawTo({
      withdrawalId: withdrawal.id,
      to: withdrawal.toAddress as Address,
      asset: withdrawal.asset,
      amount: BigInt(withdrawal.amount),
    });
    // withdrawTo only returns after a successful receipt, so there is no
    // meaningful window between Sent and Confirmed on the happy path - the
    // Sent write exists so a crash right here is recoverable.
    await this.stakePotService.markWithdrawalSent(withdrawal.id, hash);
    await this.stakePotService.markWithdrawalConfirmed(withdrawal.id, hash);
    this.logger.log(
      `Withdrawal ${withdrawal.id} paid ${withdrawal.amount} (asset ${withdrawal.asset}) to ${withdrawal.toAddress} in ${hash}`,
    );
  }

  /** Sent long enough to be presumed lost. The contract's record beats the
   *  receipt: a receipt can go missing when a tx is replaced, but
   *  `processedWithdrawals` is only set by a payout that happened. */
  private async reviewSent(withdrawal: StakePotWithdrawalEntity): Promise<void> {
    if (await this.chainService.isWithdrawalProcessed(withdrawal.id)) {
      await this.stakePotService.markWithdrawalConfirmed(withdrawal.id);
      return;
    }
    if (withdrawal.txHash) {
      const status = await this.chainService.getTransactionStatus(
        withdrawal.txHash as Hex,
      );
      if (status === 'success') {
        // Mined successfully but the contract has no record: impossible unless
        // the hash belongs to something else. Loud, and left alone.
        this.logger.error(
          `Withdrawal ${withdrawal.id} has a successful tx ${withdrawal.txHash} but is not processed on-chain`,
        );
        return;
      }
    }
    this.logger.warn(
      `Withdrawal ${withdrawal.id} was sent but never landed - retrying`,
    );
    await this.execute(withdrawal);
  }
}
