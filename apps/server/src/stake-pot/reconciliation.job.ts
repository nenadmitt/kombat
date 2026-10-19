import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { STAKE_ASSET_SYMBOLS, StakeAsset } from '@gaming-platform/core';

import { ConfigurationService } from '../configuration/configuration.service';
import { StakePotChainService } from './stake-pot-chain.service';
import { StakePotService } from './stake-pot.service';

export type ReconciliationLine = {
  asset: StakeAsset;
  symbol: string;
  onChain: string;
  ledger: string;
  drift: string;
};

export type ReconciliationSnapshot = {
  checkedAt: string;
  balanced: boolean;
  lines: ReconciliationLine[];
};

// Invariant: holdings == sum(available + locked) + sum(in-flight withdrawals). Negative drift is always a bug.
@Injectable()
export class ReconciliationJob implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ReconciliationJob.name);
  private interval?: ReturnType<typeof setInterval>;
  private running = false;
  private lastSnapshot: ReconciliationSnapshot | null = null;

  constructor(
    private readonly stakePotService: StakePotService,
    private readonly chainService: StakePotChainService,
    private readonly configurationService: ConfigurationService,
  ) {}

  onModuleInit(): void {
    if (!this.chainService.enabled) {
      return;
    }
    this.interval = setInterval(() => {
      void this.run();
    }, this.configurationService.STAKE_POT_RECONCILE_MS);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  get snapshot(): ReconciliationSnapshot | null {
    return this.lastSnapshot;
  }

  async run(): Promise<ReconciliationSnapshot> {
    if (this.running && this.lastSnapshot) {
      return this.lastSnapshot;
    }
    this.running = true;
    try {
      const ledgerTotals = await this.stakePotService.getLedgerTotals();
      const lines: ReconciliationLine[] = [];
      for (const asset of this.stakePotService.assets) {
        if (!this.chainService.hasToken(asset)) {
          continue;
        }
        const onChain = await this.chainService.getHoldings(asset);
        const ledger = ledgerTotals[asset];
        const drift = onChain - ledger;
        lines.push({
          asset,
          symbol: STAKE_ASSET_SYMBOLS[asset],
          onChain: onChain.toString(),
          ledger: ledger.toString(),
          drift: drift.toString(),
        });

        if (drift < 0n) {
          this.logger.error(
            `Stake pot SHORT for ${STAKE_ASSET_SYMBOLS[asset]}: ledger claims ${ledger}, ` +
              `contract holds ${onChain} (drift ${drift})`,
          );
        } else if (drift > 0n) {
          // Expected transiently inside the confirmation lag, and persistently for deposits to unknown addresses.
          this.logger.warn(
            `Stake pot has ${drift} unattributed ${STAKE_ASSET_SYMBOLS[asset]} ` +
              `(contract ${onChain}, ledger ${ledger})`,
          );
        }
      }

      const snapshot: ReconciliationSnapshot = {
        checkedAt: new Date().toISOString(),
        balanced: lines.every(line => line.drift === '0'),
        lines,
      };
      this.lastSnapshot = snapshot;
      return snapshot;
    } finally {
      this.running = false;
    }
  }
}
