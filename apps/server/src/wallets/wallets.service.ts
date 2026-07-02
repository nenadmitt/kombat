import {
  ConflictException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WalletEntity } from '../db/entities/wallet.entity';
import { WalletNetwork, WalletOrigin } from '../db/types/wallet';
import { generateEthereumWallet } from './ethereum-wallet.util';
import { WalletEncryptionService } from './wallet-encryption.service';

const MAX_WALLETS_PER_USER = 1;

@Injectable()
export class WalletsService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    private readonly walletEncryptionService: WalletEncryptionService,
  ) {}

  async createWallet(
    userId: string,
    network: WalletNetwork,
  ): Promise<{ address: string; mnemonic: string }> {
    const existingCount = await this.walletRepository.countBy({ userId });
    if (existingCount >= MAX_WALLETS_PER_USER) {
      throw new ConflictException('You already have a wallet');
    }

    if (network !== WalletNetwork.Ethereum) {
      throw new NotImplementedException(
        'Only Ethereum wallets are supported for now',
      );
    }

    const { mnemonic, address, privateKey } = generateEthereumWallet();

    await this.walletRepository.save(
      this.walletRepository.create({
        userId,
        address,
        key: this.walletEncryptionService.encrypt(privateKey),
        type: WalletOrigin.Platform,
        network,
      }),
    );

    return { address, mnemonic };
  }

  async listWallets(
    userId: string,
  ): Promise<{ address: string; network: WalletNetwork }[]> {
    const wallets = await this.walletRepository.find({
      where: { userId },
      select: ['address', 'network'],
    });
    return wallets.map(({ address, network }) => ({ address, network }));
  }
}
