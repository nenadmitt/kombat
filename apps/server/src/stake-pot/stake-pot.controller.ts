import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  Query,
  ServiceUnavailableException,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  STAKE_ASSET_SYMBOLS,
  isStakeableAsset,
  type StakePotBalances,
  type StakePotFeeSummary,
  type StakePotHistoryEntry,
  type StakePotWithdrawalResponse,
} from '@gaming-platform/core';

import { AdminTokenGuard } from '../admin/admin-token.guard';
import { ISecurityContext } from '../authentication/authentication.types';
import { SecurityContext } from '../authentication/decorators/security-context.decorator';
import { JwtTokenGuard } from '../authentication/guards/jwt-token.guard';
import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { SupportedVersionGuard } from '../maintenance/supported-version.guard';
import { ReconciliationJob, type ReconciliationSnapshot } from './reconciliation.job';
import { StakePotHistoryQueryDto } from './dto/history-query.dto';
import { WithdrawFromPotDto } from './dto/withdraw.dto';
import { StakePotChainService } from './stake-pot-chain.service';
import { StakePotService } from './stake-pot.service';

const DEFAULT_HISTORY_LIMIT = 25;

@Controller('stake-pot')
@UsePipes(new ValidationPipe({ whitelist: true, transform: true }))
export class StakePotController {
  constructor(
    private readonly stakePotService: StakePotService,
    private readonly chainService: StakePotChainService,
    private readonly reconciliationJob: ReconciliationJob,
    private readonly configurationService: ConfigurationService,
    private readonly dbService: DbService,
  ) {}

  /** The caller's pooled stake balance: spendable, in play, and withdrawing. */
  @Get('balances')
  @UseGuards(JwtTokenGuard)
  async getBalances(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<StakePotBalances> {
    this.assertEnabled();
    return this.stakePotService.getBalances(securityContext.userId);
  }

  @Get('history')
  @UseGuards(JwtTokenGuard)
  async getHistory(
    @SecurityContext() securityContext: ISecurityContext,
    @Query() query: StakePotHistoryQueryDto,
  ): Promise<StakePotHistoryEntry[]> {
    this.assertEnabled();
    return this.stakePotService.getHistory(
      securityContext.userId,
      query.limit ?? DEFAULT_HISTORY_LIMIT,
    );
  }

  /**
   * Queue a payout to the caller's own wallet. Returns as soon as the ledger
   * debit is durable - the on-chain transaction is the WithdrawalSweeper's job,
   * and its progress arrives over the balance socket event.
   */
  @Post('withdraw')
  @UseGuards(SupportedVersionGuard)
  @UseGuards(JwtTokenGuard)
  async withdraw(
    @SecurityContext() securityContext: ISecurityContext,
    @Body() dto: WithdrawFromPotDto,
  ): Promise<StakePotWithdrawalResponse> {
    this.assertEnabled();
    if (!/^\d+$/.test(dto.amount)) {
      throw new BadRequestException('Invalid withdrawal amount.');
    }
    const amount = BigInt(dto.amount);
    if (amount <= 0n) {
      throw new BadRequestException('Withdrawal amount must be positive.');
    }

    const [wallet] = await this.dbService.findWalletsForUser(
      securityContext.userId,
    );
    if (!wallet) {
      throw new NotFoundException('You have no wallet to withdraw to.');
    }

    const withdrawal = await this.stakePotService.requestWithdrawal(
      securityContext.userId,
      dto.asset,
      amount,
      wallet.address,
    );
    return { withdrawalId: withdrawal.id, status: withdrawal.status };
  }

  /**
   * Ledger-vs-chain drift per asset. Returns the last scheduled snapshot;
   * `?fresh=true` forces a new check (an RPC read per asset).
   */
  @Get('admin/reconciliation')
  @UseGuards(AdminTokenGuard)
  async getReconciliation(
    @Query('fresh') fresh?: string,
  ): Promise<ReconciliationSnapshot> {
    this.assertEnabled();
    if (fresh === 'true') {
      return this.reconciliationJob.run();
    }
    return (
      this.reconciliationJob.snapshot ?? (await this.reconciliationJob.run())
    );
  }

  /**
   * Platform fees: taken, swept out, and still claimable. The owner sweeps with
   * `ownerWithdrawTo` from the cold key; the watcher records it, so `swept`
   * reflects what has actually left the pot.
   */
  @Get('admin/fees')
  @UseGuards(AdminTokenGuard)
  async getFees(): Promise<StakePotFeeSummary[]> {
    this.assertEnabled();
    return this.stakePotService.getFeeSummary();
  }

  /** Where deposits should be sent, and in which assets. */
  @Get('deposit-target')
  @UseGuards(SupportedVersionGuard)
  @UseGuards(JwtTokenGuard)
  getDepositTarget(): {
    contract: string;
    chainId: number;
    tokens: { asset: number; symbol: string; address: string }[];
  } {
    this.assertEnabled();
    return {
      contract: this.chainService.address,
      chainId: this.configurationService.CHAIN_ID,
      // Only what can actually be staked AND exists on this chain - ETH
      // deposits are pointless now that only stablecoins/KOMBAT play.
      tokens: this.stakePotService.assets
        .filter(
          asset => isStakeableAsset(asset) && this.chainService.hasToken(asset),
        )
        .map(asset => ({
          asset,
          symbol: STAKE_ASSET_SYMBOLS[asset],
          address: this.chainService.tokenAddress(asset),
        })),
    };
  }

  private assertEnabled(): void {
    if (!this.chainService.enabled) {
      throw new ServiceUnavailableException(
        'The stake pot is not configured on this server.',
      );
    }
  }
}
