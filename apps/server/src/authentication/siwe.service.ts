import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import {
  createPublicClient,
  defineChain,
  getAddress,
  http,
  recoverMessageAddress,
  type Address,
  type Hex,
} from 'viem';
import {
  generateSiweNonce,
  parseSiweMessage,
  validateSiweMessage,
  verifySiweMessage,
} from 'viem/siwe';

import { CacheKeys, CacheService } from '../cache';
import { ConfigurationService } from '../configuration/configuration.service';

const NONCE_TTL_SECONDS = 5 * 60;

@Injectable()
export class SiweService {
  private readonly logger = new Logger(SiweService.name);

  readonly enabled: boolean;

  private readonly publicClient:
    | ReturnType<SiweService['makePublicClient']>
    | undefined;

  constructor(
    private readonly cacheService: CacheService,
    private readonly configService: ConfigurationService,
  ) {
    this.enabled = configService.SIWE_DOMAINS.length > 0;
    if (!this.enabled) {
      this.logger.warn('SIWE disabled: SIWE_DOMAINS is unset');
    }
    if (configService.CHAIN_RPC_URL) {
      this.publicClient = this.makePublicClient(configService.CHAIN_RPC_URL);
    }
  }

  async issueNonce(): Promise<string> {
    this.assertEnabled();
    const nonce = generateSiweNonce();
    await this.cacheService.set(CacheKeys.siweNonce(nonce), '1', NONCE_TTL_SECONDS);
    return nonce;
  }

  async verify(message: string, signature: string): Promise<Address> {
    this.assertEnabled();

    const fields = parseSiweMessage(message);
    if (!fields.address || !fields.nonce || !fields.domain) {
      throw new UnauthorizedException('Malformed sign-in message');
    }

    // Spend the nonce first, so a replay loses the race even with a valid signature.
    if (!(await this.spendNonce(fields.nonce))) {
      throw new UnauthorizedException('Sign-in request expired, try again');
    }

    if (!this.configService.SIWE_DOMAINS.includes(fields.domain.toLowerCase())) {
      throw new UnauthorizedException('Sign-in message is for another site');
    }
    if (fields.chainId !== undefined && fields.chainId !== this.configService.CHAIN_ID) {
      throw new UnauthorizedException('Sign-in message is for another chain');
    }
    if (
      !validateSiweMessage({
        message: fields,
        domain: fields.domain,
        nonce: fields.nonce,
        time: new Date(),
      })
    ) {
      throw new UnauthorizedException('Sign-in message is no longer valid');
    }

    if (!(await this.signatureMatches(message, signature as Hex, fields.address))) {
      throw new UnauthorizedException('Signature does not match the address');
    }

    return getAddress(fields.address);
  }

  private async signatureMatches(
    message: string,
    signature: Hex,
    address: Address,
  ): Promise<boolean> {
    try {
      const recovered = await recoverMessageAddress({ message, signature });
      if (recovered.toLowerCase() === address.toLowerCase()) return true;
    } catch {
      // Not a recoverable EOA signature; fall through to the contract path.
    }

    // Smart-contract accounts (ERC-1271/6492) can only be checked on-chain.
    if (!this.publicClient) return false;
    try {
      return await verifySiweMessage(this.publicClient, {
        message,
        signature,
        address,
      });
    } catch (error) {
      this.logger.warn(`SIWE contract verification failed: ${String(error)}`);
      return false;
    }
  }

  private async spendNonce(nonce: string): Promise<boolean> {
    const key = CacheKeys.siweNonce(nonce);
    if (!(await this.cacheService.get(key))) return false;
    await this.cacheService.del(key);
    return true;
  }

  private makePublicClient(rpcUrl: string) {
    return createPublicClient({
      chain: defineChain({
        id: this.configService.CHAIN_ID,
        name: `chain-${this.configService.CHAIN_ID}`,
        nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
        rpcUrls: { default: { http: [rpcUrl] } },
      }),
      transport: http(rpcUrl),
    });
  }

  private assertEnabled(): void {
    if (!this.enabled) {
      throw new ServiceUnavailableException('Wallet sign-in is not available');
    }
  }
}
