import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { STAKE_ASSET_DECIMALS, StakeAsset } from '@gaming-platform/core';
import { Repository } from 'typeorm';
import { parseUnits, type Address } from 'viem';

import { ConfigurationService } from '../configuration/configuration.service';
import { StakePotGrantEntity } from './entities/stake-pot-grant.entity';
import { StakePotChainService } from './stake-pot-chain.service';

const GRANT_ASSET = StakeAsset.Kombat;

/**
 * Pays every new player FAUCET_GRANT_KOMBAT into their stake pot, so they can
 * enter a staked match without funding anything first.
 *
 * Into the pot, not the wallet, because the pot balance is what staking spends.
 * That also keeps the faucet out of the ledger entirely: the watcher credits it
 * off the `Staked` event, the same path a player's own deposit takes.
 */
@Injectable()
export class FaucetService {
  private readonly logger = new Logger(FaucetService.name);

  constructor(
    @InjectRepository(StakePotGrantEntity)
    private readonly grantRepository: Repository<StakePotGrantEntity>,
    private readonly chainService: StakePotChainService,
    private readonly configurationService: ConfigurationService,
  ) {}

  get enabled(): boolean {
    return (
      this.chainService.faucetEnabled &&
      this.configurationService.FAUCET_GRANT_KOMBAT > 0
    );
  }

  /**
   * Grant a new player their starting balance. Safe to call more than once for
   * the same user; only the first call pays. Never throws - a failed grant must
   * not fail the signup that triggered it.
   */
  async grantSignupBonus(userId: string, address: Address): Promise<void> {
    if (!this.enabled) {
      return;
    }
    const amount = parseUnits(
      String(this.configurationService.FAUCET_GRANT_KOMBAT),
      STAKE_ASSET_DECIMALS[GRANT_ASSET],
    );

    // A deposit has no on-chain idempotency key, so this row is the only thing
    // between a retry and a double grant. Claim it before sending.
    const claim = await this.grantRepository
      .createQueryBuilder()
      .insert()
      .into(StakePotGrantEntity)
      .values({ userId, asset: GRANT_ASSET, amount: amount.toString() })
      .orIgnore()
      .execute();
    if ((claim.identifiers?.[0] ?? undefined) === undefined) {
      return; // Already granted.
    }

    try {
      const hash = await this.chainService.grantIntoPot({
        beneficiary: address,
        asset: GRANT_ASSET,
        amount,
      });
      await this.grantRepository.update({ userId }, { txHash: hash, error: null });
      this.logger.log(
        `Granted ${this.configurationService.FAUCET_GRANT_KOMBAT} KC to ${userId} (${address}) in ${hash}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The claim stays: re-sending risks paying twice, and a missing grant is
      // the cheaper failure. Loud enough to re-grant by hand.
      await this.grantRepository.update({ userId }, { error: message });
      this.logger.error(`Signup grant failed for ${userId}: ${message}`);
      await this.warnIfFaucetEmpty(amount);
    }
  }

  private async warnIfFaucetEmpty(needed: bigint): Promise<void> {
    try {
      const balance = await this.chainService.faucetBalance(GRANT_ASSET);
      if (balance < needed) {
        this.logger.error(
          `Faucet ${this.chainService.faucetAddress} is out of KC (holds ${balance}, needs ${needed} per grant)`,
        );
      }
    } catch {
      // Diagnostics only; the original failure is already logged.
    }
  }
}
