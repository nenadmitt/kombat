import {
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { STAKE_ASSET_DECIMALS, StakeAsset } from '@gaming-platform/core';
import { Repository } from 'typeorm';
import { parseUnits, type Address, type Hex } from 'viem';

import { ConfigurationService } from '../configuration/configuration.service';
import { StakePotGrantEntity } from './entities/stake-pot-grant.entity';
import { StakePotChainService } from './stake-pot-chain.service';

const GRANT_ASSET = StakeAsset.Kombat;

// Pays into the pot, not the wallet: the watcher credits it off the Staked event like any deposit.
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

  get grantAmount(): number {
    return this.configurationService.FAUCET_GRANT_KOMBAT;
  }

  get grantAmountBase(): string {
    return parseUnits(
      String(this.configurationService.FAUCET_GRANT_KOMBAT),
      STAKE_ASSET_DECIMALS[GRANT_ASSET],
    ).toString();
  }

  async alreadyClaimed(userId: string): Promise<boolean> {
    return (await this.grantRepository.countBy({ userId })) > 0;
  }

  async claim(userId: string, address: Address): Promise<{ txHash: Hex }> {
    if (!this.enabled) {
      throw new ServiceUnavailableException(
        'The welcome bonus is not available right now.',
      );
    }
    const amount = parseUnits(
      String(this.configurationService.FAUCET_GRANT_KOMBAT),
      STAKE_ASSET_DECIMALS[GRANT_ASSET],
    );

    // A deposit has no on-chain idempotency key, so this row is the only guard against a double grant.
    const claim = await this.grantRepository
      .createQueryBuilder()
      .insert()
      .into(StakePotGrantEntity)
      .values({ userId, asset: GRANT_ASSET, amount: amount.toString() })
      .orIgnore()
      .execute();
    if ((claim.identifiers?.[0] ?? undefined) === undefined) {
      throw new ConflictException('The welcome bonus was already claimed.');
    }

    try {
      const hash = await this.chainService.grantIntoPot({
        beneficiary: address,
        asset: GRANT_ASSET,
        amount,
      });
      await this.grantRepository.update({ userId }, { txHash: hash, error: null });
      this.logger.log(
        `Claimed ${this.configurationService.FAUCET_GRANT_KOMBAT} KC for ${userId} (${address}) in ${hash}`,
      );
      return { txHash: hash };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // The claim row stays: re-sending risks paying twice, and a missing grant is the cheaper failure.
      await this.grantRepository.update({ userId }, { error: message });
      this.logger.error(`Welcome bonus claim failed for ${userId}: ${message}`);
      await this.warnIfFaucetEmpty(amount);
      throw new ServiceUnavailableException(
        'The bonus could not be sent right now. Please contact support.',
      );
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
