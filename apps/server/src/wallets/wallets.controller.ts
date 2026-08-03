import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Address } from 'viem';
import { WalletBalances } from '@gaming-platform/core';

import { ISecurityContext } from '../authentication/authentication.types';
import { SecurityContext } from '../authentication/decorators/security-context.decorator';
import { JwtTokenGuard } from '../authentication/guards/jwt-token.guard';
import { ChainService } from '../chain';
import { WalletNetwork } from '../db/types/wallet';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { WalletsService } from './wallets.service';

@Controller('wallets')
@UseGuards(JwtTokenGuard)
export class WalletsController {
  constructor(
    private readonly walletsService: WalletsService,
    private readonly chainService: ChainService,
  ) {}

  /** On-chain balances (ETH / KOMBAT / USDC) for the user's wallet. */
  @Get('balances')
  async getBalances(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<WalletBalances> {
    if (!this.chainService.enabled) {
      throw new ServiceUnavailableException('On-chain features are not configured.');
    }
    const [wallet] = await this.walletsService.listWallets(
      securityContext.userId,
    );
    if (!wallet) {
      throw new NotFoundException('You have no wallet yet.');
    }
    const balances = await this.chainService.getBalances(
      wallet.address as Address,
    );
    return {
      address: wallet.address,
      balances,
    };
  }

  @Post()
  async createWallet(
    @Body() dto: CreateWalletDto,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<{ address: string; mnemonic: string }> {
    return this.walletsService.createWallet(
      securityContext.userId,
      dto.network,
    );
  }

  @Get()
  async listWallets(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<{ address: string; network: WalletNetwork }[]> {
    return this.walletsService.listWallets(securityContext.userId);
  }
}
