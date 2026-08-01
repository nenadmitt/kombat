import { Injectable, Logger } from '@nestjs/common';
import {
  ChainName,
  createOffchainClient,
  type OffchainClient,
} from '@thenamespace/offchain-manager';
import {
  ensFullName,
  ensLabelCandidate,
  toEnsLabel,
} from '@gaming-platform/core';

import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';

/** Suffix attempts before giving up on a contested label. */
const MAX_LABEL_ATTEMPTS = 5;

/**
 * Mints <username>.playkombat.xyz off-chain and points it at the user's
 * custodial wallet.
 *
 * Minted once, from the first username, and never renamed: people share a
 * name, and one that moves underneath them resolves to the wrong player.
 */
@Injectable()
export class EnsSubnameService {
  private readonly logger = new Logger(EnsSubnameService.name);
  private readonly client?: OffchainClient;

  constructor(
    private readonly configurationService: ConfigurationService,
    private readonly dbService: DbService,
  ) {
    if (configurationService.NAMESPACE_API_KEY) {
      this.client = createOffchainClient({
        mode: 'mainnet',
        defaultApiKey: configurationService.NAMESPACE_API_KEY,
      });
      this.logger.log(
        `ENS subnames enabled under ${configurationService.ENS_PARENT_NAME}`,
      );
    }
  }

  get enabled(): boolean {
    return this.client !== undefined;
  }

  /**
   * Claim a subname for a user who does not have one. Never throws: a missing
   * ENS name must not cost someone their username.
   */
  async mintForUsername(
    userId: string,
    username: string,
    address: string | undefined,
  ): Promise<string | null> {
    if (!this.client) {
      return null;
    }
    const base = toEnsLabel(username);
    if (!base) {
      this.logger.warn(`Username "${username}" has no usable ENS label`);
      return null;
    }

    const parentName = this.configurationService.ENS_PARENT_NAME;
    try {
      for (let attempt = 1; attempt <= MAX_LABEL_ATTEMPTS; attempt++) {
        const label = ensLabelCandidate(base, attempt);
        const fullName = ensFullName(label, parentName);
        const { isAvailable } = await this.client.isSubnameAvailable(fullName);
        if (!isAvailable) {
          continue;
        }
        // Claim the row before the API call: the partial unique index is what
        // stops two concurrent onboardings from both taking this label, and a
        // name minted against a row we then fail to write is unattributable.
        if (!(await this.dbService.claimEnsName(userId, fullName))) {
          continue;
        }
        await this.client.createSubname({
          label,
          parentName,
          owner: address,
          addresses: address
            ? [{ chain: ChainName.Ethereum, value: address }]
            : [],
          texts: [{ key: 'name', value: username }],
        });
        this.logger.log(`Minted ${fullName} for ${userId} (${address ?? 'no wallet'})`);
        return fullName;
      }
      this.logger.warn(
        `No free label for "${username}" after ${MAX_LABEL_ATTEMPTS} attempts`,
      );
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Release the claim so a later attempt can retry the same label.
      await this.dbService.clearEnsName(userId).catch(() => undefined);
      this.logger.error(`Subname mint failed for ${userId}: ${message}`);
      return null;
    }
  }

  /**
   * Point a user's existing subname at their wallet. Onboarding sets the
   * username before the wallet exists, so the name is usually minted with no
   * address and would otherwise resolve to nothing.
   */
  async attachWallet(userId: string, address: string): Promise<void> {
    if (!this.client) {
      return;
    }
    try {
      const user = await this.dbService.findUserById(userId);
      if (!user?.ensName) {
        return;
      }
      await this.client.setDefaultEvmAddress(user.ensName, address);
      this.logger.log(`${user.ensName} now resolves to ${address}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not point a subname at ${address}: ${message}`);
    }
  }
}
