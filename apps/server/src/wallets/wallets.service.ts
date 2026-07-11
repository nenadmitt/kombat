import {
  ConflictException,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';

import { ChainService } from '../chain';
import { DbService } from '../db';
import { WalletNetwork, WalletOrigin } from '../db/types/wallet';
import { generateEthereumWallet } from './ethereum-wallet.util';
import { WalletEncryptionService } from './wallet-encryption.service';

const MAX_WALLETS_PER_USER = 1;

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly walletEncryptionService: WalletEncryptionService,
    private readonly chainService: ChainService,
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

    // Bundled setup for staking: gas-dust the fresh wallet and pre-approve
    // the escrow for every ERC20 stake asset, so joining a staked match
    // later is a single operator tx. Fire-and-forget — the funding path
    // re-checks allowances anyway; this just front-loads the latency.
    void this.chainService.prepareWalletForStaking(userId).catch(error => {
      this.logger.warn(
        `Wallet staking setup failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
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
