import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  NotImplementedException,
} from '@nestjs/common';
import { UserPlatform } from '@gaming-platform/core';


import { ChainService } from '../chain';
import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { EnsSubnameService } from '../ens';
import { WalletNetwork, WalletOrigin } from '../db/types/wallet';
import { generateEthereumWallet } from './ethereum-wallet.util';
import { encryptPrivateKey, parseEncryptionKey } from './key-cipher.util';

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

    // The wallet needs gas to sign its own first pot deposit. Fire-and-forget:
    // a dusting failure must not fail wallet creation.
    void this.chainService.fundGasFor(userId).catch((error: unknown) => {
      this.logger.warn(
        `Wallet gas top-up failed for user ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    // Onboarding sets the username before the wallet exists, so a subname
    // minted then has no address to resolve to. This is where it gets one.
    void this.ensSubnameService.attachWallet(userId, address);

    return { address, mnemonic };
  }

  async listWallets(
    userId: string,
  ): Promise<{ address: string; network: WalletNetwork }[]> {
    const wallets = await this.dbService.findWalletsForUser(userId);
    return wallets.map(({ address, network }) => ({ address, network }));
  }
}
