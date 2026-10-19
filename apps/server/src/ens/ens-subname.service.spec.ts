import { ConfigurationService } from '../configuration/configuration.service';
import { DbService } from '../db';
import { EnsSubnameService } from './ens-subname.service';

const USER = '11111111-1111-4111-8111-111111111111';
const ADDRESS = '0xb1DbB93Aa253d71987272e68f3CF72d99a0153fa';
const PARENT = 'playkombat.xyz';

type Created = {
  label: string;
  parentName: string;
  owner?: string;
  addresses?: { chain: string; value: string }[];
  texts?: { key: string; value: string }[];
};

describe('EnsSubnameService', () => {
  let taken: Set<string>;
  let created: Created[];
  let claims: Map<string, string>;
  let claimFails: number;
  let createThrows: Error | null;
  let service: EnsSubnameService;

  // null, not undefined: an explicit undefined would re-trigger the default.
  const build = (apiKey: string | null = 'ns-test') => {
    const config = {
      NAMESPACE_API_KEY: apiKey ?? undefined,
      ENS_PARENT_NAME: PARENT,
    } as ConfigurationService;

    const db = {
      findUserById: async () => ({ id: USER, ensName: claims.get(USER) ?? null }),
      claimEnsName: async (userId: string, ensName: string) => {
        if (claimFails > 0) {
          claimFails -= 1;
          return false;
        }
        if ([...claims.values()].includes(ensName)) {
          return false;
        }
        claims.set(userId, ensName);
        return true;
      },
      clearEnsName: async (userId: string) => {
        claims.delete(userId);
      },
    } as unknown as DbService;

    const svc = new EnsSubnameService(config, db);
    (svc as unknown as { client?: unknown }).client = apiKey
      ? {
          isSubnameAvailable: async (fullName: string) => ({
            isAvailable: !taken.has(fullName),
          }),
          createSubname: async (req: Created) => {
            if (createThrows) {
              throw createThrows;
            }
            created.push(req);
            taken.add(`${req.label}.${req.parentName}`);
          },
          setDefaultEvmAddress: async () => undefined,
        }
      : undefined;
    return svc;
  };

  beforeEach(() => {
    taken = new Set();
    created = [];
    claims = new Map();
    claimFails = 0;
    createThrows = null;
    service = build();
  });

  describe('minting', () => {
    it('mints the plain label and points it at the wallet', async () => {
      const name = await service.mintForUsername(USER, 'Alice', ADDRESS);

      expect(name).toBe(`alice.${PARENT}`);
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({
        label: 'alice',
        parentName: PARENT,
        owner: ADDRESS,
      });
      expect(created[0].addresses?.[0]?.value).toBe(ADDRESS);
      expect(created[0].texts).toEqual([{ key: 'name', value: 'Alice' }]);
    });

    it('suffixes past a label already taken on the API', async () => {
      taken.add(`alice.${PARENT}`);

      expect(await service.mintForUsername(USER, 'alice', ADDRESS)).toBe(
        `alice-2.${PARENT}`,
      );
      expect(created[0].label).toBe('alice-2');
    });

    it('suffixes past a label another user claimed first', async () => {
      claims.set('someone-else', `alice.${PARENT}`);

      expect(await service.mintForUsername(USER, 'alice', ADDRESS)).toBe(
        `alice-2.${PARENT}`,
      );
    });

    it('keeps walking when it loses the claim race repeatedly', async () => {
      claimFails = 2;

      expect(await service.mintForUsername(USER, 'alice', ADDRESS)).toBe(
        `alice-3.${PARENT}`,
      );
    });

    it('gives up rather than looping forever on a contested label', async () => {
      for (let i = 1; i <= 9; i++) {
        taken.add(`${i === 1 ? 'alice' : `alice-${i}`}.${PARENT}`);
      }

      expect(await service.mintForUsername(USER, 'alice', ADDRESS)).toBeNull();
      expect(created).toHaveLength(0);
    });

    it('resolves on every EVM chain we settle on, not just mainnet', async () => {
      const name = await service.mintForUsername(USER, 'alice', ADDRESS);

      expect(name).toBe(`alice.${PARENT}`);
      expect(created[0]?.owner).toBe(ADDRESS);
      expect(created[0]?.addresses?.map(a => a.chain)).toEqual([
        'eth',
        'base',
        'op',
        'arb',
        'scroll',
      ]);
      expect(
        new Set(created[0]?.addresses?.map(a => a.value)),
      ).toEqual(new Set([ADDRESS]));
    });
  });

  describe('failure paths', () => {
    it('is a no-op when no API key is configured', async () => {
      const disabled = build(null);

      expect(disabled.enabled).toBe(false);
      expect(await disabled.mintForUsername(USER, 'alice', ADDRESS)).toBeNull();
      expect(created).toHaveLength(0);
    });

    it('returns null for a username with no usable label', async () => {
      expect(await service.mintForUsername(USER, '___', ADDRESS)).toBeNull();
      expect(created).toHaveLength(0);
      expect(claims.size).toBe(0);
    });

    it('releases the claim when the API rejects the create', async () => {
      createThrows = new Error('namespace 503');

      expect(await service.mintForUsername(USER, 'alice', ADDRESS)).toBeNull();
      expect(claims.has(USER)).toBe(false);
    });

    it('never throws, whatever the API does', async () => {
      createThrows = new Error('boom');
      await expect(
        service.mintForUsername(USER, 'alice', ADDRESS),
      ).resolves.toBeNull();
    });
  });
});
