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

const MAX_ATTEMPTS = 3;

// Must stay above the operator lock's TTL (120s), or the sweeper fights a healthy in-flight send.
const SENT_STALE_MS = 130_000;

// Chain-state-first: every row starts by asking the contract whether this id already paid.
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
            // Lock held by another job: not a failure, so don't burn an attempt.
            this.logger.debug(
              `Operator busy, deferring withdrawal ${withdrawal.id}`,
            );
            continue;
          }
          if (this.chainService.isAlreadyProcessedError(error)) {
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
    // The Sent write exists so a crash right here is recoverable.
    await this.stakePotService.markWithdrawalSent(withdrawal.id, hash);
    await this.stakePotService.markWithdrawalConfirmed(withdrawal.id, hash);
    this.logger.log(
      `Withdrawal ${withdrawal.id} paid ${withdrawal.amount} (asset ${withdrawal.asset}) to ${withdrawal.toAddress} in ${hash}`,
    );
  }

  // The contract's record beats the receipt: a receipt can go missing when a tx is replaced.
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
        // Mined but unrecorded by the contract: only possible if the hash belongs to something else.
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
