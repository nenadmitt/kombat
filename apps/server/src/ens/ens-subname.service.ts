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

const MAX_LABEL_ATTEMPTS = 5;

// Same address on every EVM chain: a name that only answers for eth looks unfunded elsewhere.
const EVM_CHAINS = [
  ChainName.Ethereum,
  ChainName.Base,
  ChainName.Optimism,
  ChainName.Arbitrum,
  ChainName.Scroll,
] as const;

const evmAddressRecords = (address: string) =>
  EVM_CHAINS.map(chain => ({ chain, value: address }));

// Never renamed: people share the name, and one that moves resolves to the wrong player.
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

  // Never throws: a missing ENS name must not cost someone their username.
  async mintForUsername(
    userId: string,
    username: string,
    address: string,
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
        // Claim the row before the API call: the partial unique index stops two onboardings taking this label.
        if (!(await this.dbService.claimEnsName(userId, fullName))) {
          continue;
        }
        await this.client.createSubname({
          label,
          parentName,
          owner: address,
          addresses: evmAddressRecords(address),
          texts: [{ key: 'name', value: username }],
        });
        this.logger.log(`Minted ${fullName} for ${userId} (${address})`);
        return fullName;
      }
      this.logger.warn(
        `No free label for "${username}" after ${MAX_LABEL_ATTEMPTS} attempts`,
      );
      return null;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.dbService.clearEnsName(userId).catch(() => undefined);
      this.logger.error(`Subname mint failed for ${userId}: ${message}`);
      return null;
    }
  }

}
