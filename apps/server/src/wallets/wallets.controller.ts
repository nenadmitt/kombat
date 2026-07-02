import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { ISecurityContext } from '../authentication/authentication.types';
import { SecurityContext } from '../authentication/decorators/security-context.decorator';
import { JwtTokenGuard } from '../authentication/guards/jwt-token.guard';
import { WalletNetwork } from '../db/types/wallet';
import { CreateWalletDto } from './dto/create-wallet.dto';
import { WalletsService } from './wallets.service';

@Controller('api/v1/wallets')
@UseGuards(JwtTokenGuard)
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

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
