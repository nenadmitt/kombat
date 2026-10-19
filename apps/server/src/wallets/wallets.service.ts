import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { UserPlatform, type WalletSummary } from '@gaming-platform/core';


import { ChainService } from '../chain';
import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { EnsSubnameService } from '../ens';
import { WalletNetwork, WalletOrigin } from '../db/types/wallet';
import { generateEthereumWallet } from './ethereum-wallet.util';
import {
  decryptPrivateKey,
  encryptPrivateKey,
  parseEncryptionKey,
} from './key-cipher.util';

const MAX_WALLETS_PER_USER = 1;

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly chainService: ChainService,
    private readonly configurationService: ConfigurationService,
    private readonly ensSubnameService: EnsSubnameService,
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

    const user = await this.dbService.findUserById(userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    // Custody follows the account, never a caller-supplied flag.
    const custodial = user.platform === UserPlatform.Web;

    // The mnemonic is returned once and never persisted.
    const { mnemonic, address, privateKey } = generateEthereumWallet();

    try {
      await this.dbService.createWallet({
        userId,
        address,
        type: custodial ? WalletOrigin.Embedded : WalletOrigin.Platform,
        network,
        // Losing W_ENCRYPT loses every custodial wallet.
        ...(custodial
          ? {
              encryptedPrivateKey: encryptPrivateKey(
                privateKey,
                parseEncryptionKey(this.configurationService.W_ENCRYPT),
              ),
            }
          : {}),
      });
    } catch (error) {
      // The count check above is advisory; the unique index is the rule, and a racing loser lands here.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('You already have a wallet');
      }
      throw error;
    }

    // Fire-and-forget: a dusting failure must not fail wallet creation.
    void this.chainService.fundGasFor(userId).catch((error: unknown) => {
      this.logger.warn(
        `Wallet gas top-up failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    // Awaited because the wallet screen also shows the name; mintForUsername never throws.
    if (user.username && !user.ensName) {
      await this.ensSubnameService.mintForUsername(
        userId,
        user.username,
        address,
      );
    }

    return { address, mnemonic };
  }

  // The platform holds the key only because a browser has nowhere durable to keep one.
  async getEmbeddedKey(
    userId: string,
  ): Promise<{ address: string; privateKey: string }> {
    const wallet = await this.dbService.findEmbeddedWalletForUser(userId);
    if (!wallet?.encryptedPrivateKey) {
      throw new NotFoundException('This account has no embedded wallet');
    }
    return {
      address: wallet.address,
      privateKey: decryptPrivateKey(
        wallet.encryptedPrivateKey,
        parseEncryptionKey(this.configurationService.W_ENCRYPT),
      ),
    };
  }

  async listWallets(userId: string): Promise<WalletSummary[]> {
    const wallets = await this.dbService.findWalletsForUser(userId);
    return wallets.map(({ address, network, type }) => ({
      address,
      network,
      custodial: type === WalletOrigin.Embedded,
    }));
  }
}
