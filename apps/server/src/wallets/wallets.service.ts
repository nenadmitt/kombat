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
    // Custody follows the account, never a caller-supplied flag: a web client
    // cannot ask for a device wallet it has no way to sign with, and a phone
    // cannot ask us to hold its key.
    const custodial = user.platform === UserPlatform.Web;

    // The mnemonic is handed to the caller once and never persisted. For a
    // mobile (Platform) wallet nothing else is kept either: the key stays on
    // the device, and the server has no path that signs for that player.
    const { mnemonic, address, privateKey } = generateEthereumWallet();

    try {
      await this.dbService.createWallet({
        userId,
        address,
        type: custodial ? WalletOrigin.Embedded : WalletOrigin.Platform,
        network,
        // A web player has no device key store, so the platform holds the key
        // encrypted at rest. Losing W_ENCRYPT loses every one of these wallets.
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
      // The count check above is advisory; the unique index is the rule. Two
      // concurrent creations (React StrictMode double-fires effects in dev)
      // both pass the count and race to insert - the loser lands here.
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException('You already have a wallet');
      }
      throw error;
    }

    // The wallet needs gas to sign its own first pot deposit. Fire-and-forget:
    // a dusting failure must not fail wallet creation.
    void this.chainService.fundGasFor(userId).catch((error: unknown) => {
      this.logger.warn(
        `Wallet gas top-up failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    // The other half of the pair: a username set before the wallet had none
    // to mint against, so the name is claimed here instead.
    if (user.username && !user.ensName) {
      void this.ensSubnameService.mintForUsername(
        userId,
        user.username,
        address,
      );
    }

    return { address, mnemonic };
  }

  /**
   * The embedded wallet's key, for its owner. A web player signs in their own
   * browser exactly as a connected wallet does, so the key has to reach the
   * client; the platform holds it only because a browser has nowhere durable
   * to keep one.
   */
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
