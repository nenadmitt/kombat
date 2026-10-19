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
  StakeAsset,
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
import { FaucetService } from './faucet.service';
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
    private readonly faucetService: FaucetService,
  ) {}

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

  @Get('admin/fees')
  @UseGuards(AdminTokenGuard)
  async getFees(): Promise<StakePotFeeSummary[]> {
    this.assertEnabled();
    return this.stakePotService.getFeeSummary();
  }

  // Doesn't 503 when staking is off: "not available" is the answer a client needs either way.
  @Get('welcome-bonus')
  @UseGuards(JwtTokenGuard)
  async welcomeBonus(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<{ available: boolean; amount: string; symbol: string }> {
    const available =
      this.chainService.enabled &&
      this.faucetService.enabled &&
      !(await this.faucetService.alreadyClaimed(securityContext.userId));
    return {
      available,
      amount: this.faucetService.grantAmountBase,
      symbol: STAKE_ASSET_SYMBOLS[StakeAsset.Kombat],
    };
  }

  @Post('claim')
  @UseGuards(SupportedVersionGuard)
  @UseGuards(JwtTokenGuard)
  async claim(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<{ txHash: string; amount: string; symbol: string }> {
    this.assertEnabled();
    const [wallet] = await this.dbService.findWalletsForUser(
      securityContext.userId,
    );
    if (!wallet) {
      throw new NotFoundException('You have no wallet yet.');
    }
    const { txHash } = await this.faucetService.claim(
      securityContext.userId,
      wallet.address as `0x${string}`,
    );
    return {
      txHash,
      amount: String(this.faucetService.grantAmount),
      symbol: 'KOMBAT',
    };
  }

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
