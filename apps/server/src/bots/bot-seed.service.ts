import { Injectable, Logger } from '@nestjs/common';
import { BOT_ACCOUNTS, UserPlatform } from '@gaming-platform/core';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { UserEntity } from '../db/entities/user.entity';
import { WalletNetwork, WalletOrigin } from '../db/types/wallet';
import { generateEthereumWallet } from '../wallets/ethereum-wallet.util';
import { encryptPrivateKey, parseEncryptionKey } from '../wallets/key-cipher.util';

export type BotSeedResult = {
  created: string[];
  walletsAttached: string[];
  alreadyPresent: string[];
  skipped: string[];
};

// Writes rows directly: UsersService/WalletsService would mint an ENS subname and gas-dust every bot.
@Injectable()
export class BotSeedService {
  private readonly logger = new Logger(BotSeedService.name);

  constructor(
    private readonly dbService: DbService,
    private readonly configurationService: ConfigurationService,
  ) {}

  async seed(count = BOT_ACCOUNTS.length): Promise<BotSeedResult> {
    const roster = BOT_ACCOUNTS.slice(0, count);
    const result: BotSeedResult = {
      created: [],
      walletsAttached: [],
      alreadyPresent: [],
      skipped: [],
    };

    for (const account of roster) {
      const existing = await this.dbService.findUserByEmail(account.email);
      if (!existing) {
        const holder = await this.dbService.findUserByUsername(account.username);
        if (holder) {
          result.skipped.push(account.username);
          continue;
        }
      }
      const user =
        existing ?? (await this.createBot(account.email, account.username));

      if (existing) {
        result.alreadyPresent.push(account.username);
        if (!existing.isBot) {
          await this.dbService.setUserIsBot(existing.id, true);
        }
      } else {
        result.created.push(account.username);
      }

      if ((await this.dbService.countWalletsForUser(user.id)) === 0) {
        await this.attachWallet(user.id);
        result.walletsAttached.push(account.username);
      }
    }

    this.logger.log(
      `Bot seed: ${result.created.length} created, ${result.alreadyPresent.length} already present, ${result.walletsAttached.length} wallet(s) attached, ${result.skipped.length} skipped`,
    );
    return result;
  }

  private createBot(email: string, username: string): Promise<UserEntity> {
    // Web platform makes the wallet custodial: a bot has no device to hold a key.
    return this.dbService.createBotUser(email, username, UserPlatform.Web);
  }

  private async attachWallet(userId: string): Promise<void> {
    const { address, privateKey } = generateEthereumWallet();
    await this.dbService.createWallet({
      userId,
      address,
      type: WalletOrigin.Embedded,
      network: WalletNetwork.Ethereum,
      encryptedPrivateKey: encryptPrivateKey(
        privateKey,
        parseEncryptionKey(this.configurationService.W_ENCRYPT),
      ),
    });
  }
}
