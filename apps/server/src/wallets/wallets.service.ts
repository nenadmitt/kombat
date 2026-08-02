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
import { EnsSubnameService } from '../ens';
import { WalletNetwork, WalletOrigin } from '../db/types/wallet';
import { generateEthereumWallet } from './ethereum-wallet.util';

const MAX_WALLETS_PER_USER = 1;

@Injectable()
export class WalletsService {
  private readonly logger = new Logger(WalletsService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly chainService: ChainService,
    private readonly configurationService: ConfigurationService,
    private readonly faucetService: FaucetService,
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

    // The mnemonic is handed to the caller once and never persisted: the
    // server has no path that signs for a player (deposits, transfers and
    // permits are all signed on the device), so keeping the key would add no
    // capability and make this database a single point of total loss. The
    // consequence is deliberate - a player who loses their mnemonic cannot be
    // recovered by the platform.
    const { mnemonic, address } = generateEthereumWallet();

    await this.dbService.createWallet({
      userId,
      address,
      type: WalletOrigin.Platform,
      network,
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

    // Starting balance, paid into the new player's stake pot. Fire-and-forget
    // and internally guarded: a faucet problem must never fail wallet creation,
    // and the player can still deposit their own funds.
    void this.faucetService.grantSignupBonus(userId, address as Address);

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
