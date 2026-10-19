import {
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { privateKeyToAccount } from 'viem/accounts';
import { createSiweMessage } from 'viem/siwe';

import { CacheService } from '../cache';
import { ConfigurationService } from '../configuration/configuration.service';
import { SiweService } from './siwe.service';

const DOMAIN = 'play.playkombat.xyz';
const CHAIN_ID = 11155111;

const account = privateKeyToAccount(
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
);

function fakeCache(): CacheService {
  const entries = new Map<string, string>();
  return {
    get: (key: string) => Promise.resolve(entries.get(key) ?? null),
    set: (key: string, value: string) => {
      entries.set(key, value);
      return Promise.resolve();
    },
    del: (...keys: string[]) => {
      keys.forEach(key => entries.delete(key));
      return Promise.resolve();
    },
  } as unknown as CacheService;
}

function makeService(domains: string[] = [DOMAIN]): SiweService {
  return new SiweService(fakeCache(), {
    SIWE_DOMAINS: domains,
    CHAIN_ID,
    CHAIN_RPC_URL: undefined,
  } as unknown as ConfigurationService);
}

async function signIn(
  service: SiweService,
  overrides: Partial<{ domain: string; nonce: string; chainId: number }> = {},
) {
  const nonce = overrides.nonce ?? (await service.issueNonce());
  const message = createSiweMessage({
    address: account.address,
    chainId: overrides.chainId ?? CHAIN_ID,
    domain: overrides.domain ?? DOMAIN,
    nonce,
    uri: `https://${overrides.domain ?? DOMAIN}/signin`,
    version: '1',
  });
  const signature = await account.signMessage({ message });
  return { message, signature };
}

describe('SiweService', () => {
  it('returns the checksummed signer for a well-formed sign-in', async () => {
    const service = makeService();
    const { message, signature } = await signIn(service);

    await expect(service.verify(message, signature)).resolves.toBe(
      account.address,
    );
  });

  it('refuses to spend the same nonce twice', async () => {
    const service = makeService();
    const { message, signature } = await signIn(service);
    await service.verify(message, signature);

    await expect(service.verify(message, signature)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a nonce it never issued', async () => {
    const service = makeService();
    const { message, signature } = await signIn(service, {
      nonce: 'deadbeefdeadbeef',
    });

    await expect(service.verify(message, signature)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a message signed for another domain', async () => {
    const service = makeService();
    const { message, signature } = await signIn(service, {
      domain: 'evil.example.com',
    });

    await expect(service.verify(message, signature)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a message signed for another chain', async () => {
    const service = makeService();
    const { message, signature } = await signIn(service, { chainId: 1 });

    await expect(service.verify(message, signature)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a signature from a different key', async () => {
    const service = makeService();
    const { message } = await signIn(service);
    const impostor = privateKeyToAccount(
      '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
    );
    const signature = await impostor.signMessage({ message });

    await expect(service.verify(message, signature)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('503s every entry point when no domain is configured', async () => {
    const service = makeService([]);

    await expect(service.issueNonce()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
