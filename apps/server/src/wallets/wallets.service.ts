import {
  ConflictException,
  Injectable,
  NotImplementedException,
} from '@nestjs/common';

import { DbService } from '../db';
import { WalletNetwork, WalletOrigin } from '../db/types/wallet';
import { generateEthereumWallet } from './ethereum-wallet.util';
import { WalletEncryptionService } from './wallet-encryption.service';

const MAX_WALLETS_PER_USER = 1;

@Injectable()
export class WalletsService {
  constructor(
    private readonly dbService: DbService,
    private readonly walletEncryptionService: WalletEncryptionService,
  ) {}

  async createWallet(
    userId: string,
    network: WalletNetwork,
  ): Promise<{ address: string; mnemonic: string }> {
    const existingCount = await this.dbService.countWalletsForUser(userId);
    if (existingCount >= MAX_WALLETS_PER_USER) {
      throw new ConflictException('You already have a wallet');
    }

    if (network !== WalletNetwork.Ethereum) {
      throw new NotImplementedException(
        'Only Ethereum wallets are supported for now',
      );
    }

    const { mnemonic, address, privateKey } = generateEthereumWallet();

    await this.dbService.createWallet({
      userId,
      address,
      key: this.walletEncryptionService.encrypt(privateKey),
      type: WalletOrigin.Platform,
      network,
    });

    return { address, mnemonic };
  }

  async listWallets(
    userId: string,
  ): Promise<{ address: string; network: WalletNetwork }[]> {
    const wallets = await this.dbService.findWalletsForUser(userId);
    return wallets.map(({ address, network }) => ({ address, network }));
  }
}
