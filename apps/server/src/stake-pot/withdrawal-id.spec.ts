import type { Hex } from 'viem';

import { CacheService } from '../cache';
import { ConfigurationService } from '../configuration/configuration.service';
import { StakePotChainService } from './stake-pot-chain.service';

describe('withdrawal id encoding', () => {
  const service = new StakePotChainService(
    {} as ConfigurationService,
    {} as CacheService,
  );

  const uuids = [
    '019fafe8-4741-76c5-ad43-0b919261bc32',
    '00000000-0000-4000-8000-000000000000',
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
  ];

  it('is disabled without config, so the encoding is all that is exercised', () => {
    expect(service.enabled).toBe(false);
  });

  it.each(uuids)('round-trips %s', uuid => {
    expect(
      service.bytes32ToWithdrawalId(service.withdrawalIdToBytes32(uuid)),
    ).toBe(uuid);
  });

  it('rejects an id that cannot be a withdrawal row', () => {
    expect(
      service.bytes32ToWithdrawalId(
        '0x9f2b0dd7d3f6a3f38dcbbc0ef4e0a04ea1ad0dd0d17bfbb1b2f3d5e6a7b8c9d0',
      ),
    ).toBeNull();
    expect(
      service.bytes32ToWithdrawalId(
        '0x00000000000000000000000000000001019fafe8474176c5ad430b919261bc32',
      ),
    ).toBeNull();
  });

  it('is case-insensitive about the hex it is handed', () => {
    const uuid = uuids[0]!;
    const upper = service
      .withdrawalIdToBytes32(uuid)
      .toUpperCase()
      .replace('0X', '0x');
    expect(service.bytes32ToWithdrawalId(upper as Hex)).toBe(uuid);
  });
});
