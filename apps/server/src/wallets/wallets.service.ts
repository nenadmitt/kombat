import {
  ConflictException,
  Injectable,
  Logger,
  NotImplementedException,
} from '@nestjs/common';

import type { Address } from 'viem';

import { ChainService } from '../chain';
import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { FaucetService } from '../stake-pot';
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
    private readonly configurationService: ConfigurationService,
    private readonly faucetService: FaucetService,
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

    // Fire-and-forget staking setup. In pot mode the wallet only needs gas to
    // send its own deposit; escrow allowances would never be used. In escrow
    // mode we also pre-approve, so joining a staked match is one operator tx.
    const setup =
      this.configurationService.STAKING_MODE === 'pot'
        ? this.chainService.fundGasFor(userId)
        : this.chainService.prepareWalletForStaking(userId);
    void setup.catch(error => {
      this.logger.warn(
        `Wallet staking setup failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    // Starting balance, paid into the new player's stake pot. Fire-and-forget
    // and internally guarded: a faucet problem must never fail wallet creation,
    // and the player can still deposit their own funds.
    void this.faucetService.grantSignupBonus(userId, address as Address);

    return { address, mnemonic };
  }

  async listWallets(
    userId: string,
  ): Promise<{ address: string; network: WalletNetwork }[]> {
    const wallets = await this.dbService.findWalletsForUser(userId);
    return wallets.map(({ address, network }) => ({ address, network }));
  }
}
