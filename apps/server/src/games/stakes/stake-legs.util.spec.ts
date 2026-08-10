import { BadRequestException } from '@nestjs/common';
import { StakeAsset, convertStakeAmount } from '@gaming-platform/core';

import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { GameType } from '../../db/types/game';
import { resolveJoinToken, stakeLegsOf } from './stake-legs.util';

const CREATOR = '11111111-1111-4111-8111-111111111111';
const JOINER = '22222222-2222-4222-8222-222222222222';
const THIRD = '33333333-3333-4333-8333-333333333333';

const USDC_10 = '10000000';
const DAI_10 = '10000000000000000000';

const room = (over: Partial<GameRoomEntity> = {}): GameRoomEntity =>
  ({
    id: '44444444-4444-4444-8444-444444444444',
    userId: CREATOR,
    opponentId: JOINER,
    opponentIds: [],
    gameType: GameType.NavalBattle,
    stakeToken: StakeAsset.Usdc,
    stakeAmount: USDC_10,
    stakeTokenChoices: null,
    ...over,
  }) as unknown as GameRoomEntity;

describe('convertStakeAmount', () => {
  it('scales 6dp up to 18dp and back for the same human value', () => {
    expect(convertStakeAmount(USDC_10, StakeAsset.Usdc, StakeAsset.Dai)).toBe(
      DAI_10,
    );
    expect(convertStakeAmount(DAI_10, StakeAsset.Dai, StakeAsset.Usdc)).toBe(
      USDC_10,
    );
  });

  it('is the identity between assets of equal decimals', () => {
    expect(convertStakeAmount(USDC_10, StakeAsset.Usdc, StakeAsset.Usdt)).toBe(
      USDC_10,
    );
    expect(convertStakeAmount(USDC_10, StakeAsset.Usdc, StakeAsset.Usdc)).toBe(
      USDC_10,
    );
  });

  it('refuses to truncate precision the target asset cannot hold', () => {
    expect(() =>
      convertStakeAmount('1', StakeAsset.Dai, StakeAsset.Usdc),
    ).toThrow(/precision/);
    expect(() =>
      convertStakeAmount('1000000000001', StakeAsset.Dai, StakeAsset.Usdc),
    ).toThrow(/precision/);
    expect(
      convertStakeAmount('1000000000000', StakeAsset.Dai, StakeAsset.Usdc),
    ).toBe('1');
  });

  it('rejects anything that is not a base-unit integer', () => {
    for (const bad of ['1.5', '-1', '', 'abc']) {
      expect(() =>
        convertStakeAmount(bad, StakeAsset.Usdc, StakeAsset.Dai),
      ).toThrow(/Invalid amount/);
    }
  });
});

describe('resolveJoinToken', () => {
  it('defaults to the room token when the client sends nothing', () => {
    expect(resolveJoinToken(room(), undefined)).toBe(StakeAsset.Usdc);
  });

  it('ignores the request on a free room', () => {
    expect(
      resolveJoinToken(
        room({ stakeToken: null, stakeAmount: null }),
        StakeAsset.Dai,
      ),
    ).toBeNull();
  });

  it('takes any stablecoin for a stable-staked room', () => {
    for (const asset of [StakeAsset.Usdc, StakeAsset.Usdt, StakeAsset.Dai]) {
      expect(resolveJoinToken(room(), asset)).toBe(asset);
    }
  });

  it('rejects KOMBAT in a stable-staked room', () => {
    expect(() => resolveJoinToken(room(), StakeAsset.Kombat)).toThrow(
      BadRequestException,
    );
  });

  it('rejects a stablecoin in a KOMBAT room', () => {
    const kombat = room({
      stakeToken: StakeAsset.Kombat,
      stakeAmount: DAI_10,
    });
    expect(() => resolveJoinToken(kombat, StakeAsset.Usdc)).toThrow(
      BadRequestException,
    );
    expect(resolveJoinToken(kombat, StakeAsset.Kombat)).toBe(StakeAsset.Kombat);
    expect(resolveJoinToken(kombat, undefined)).toBe(StakeAsset.Kombat);
  });
});

describe('stakeLegsOf', () => {
  it('gives every seat the room token when nobody picked another', () => {
    expect(stakeLegsOf(room())).toEqual([
      { userId: CREATOR, asset: StakeAsset.Usdc, amount: 10_000_000n },
      { userId: JOINER, asset: StakeAsset.Usdc, amount: 10_000_000n },
    ]);
  });

  it('converts a chosen token into its own decimals', () => {
    const legs = stakeLegsOf(
      room({ stakeTokenChoices: { [JOINER]: StakeAsset.Dai } }),
    );
    expect(legs).toEqual([
      { userId: CREATOR, asset: StakeAsset.Usdc, amount: 10_000_000n },
      { userId: JOINER, asset: StakeAsset.Dai, amount: BigInt(DAI_10) },
    ]);
  });

  it('keeps the creator on the room token whatever the map says', () => {
    const legs = stakeLegsOf(
      room({ stakeTokenChoices: { [CREATOR]: StakeAsset.Dai } }),
    );
    expect(legs[0]).toEqual({
      userId: CREATOR,
      asset: StakeAsset.Usdc,
      amount: 10_000_000n,
    });
  });

  it('reads every seat of a multi-seat room', () => {
    const legs = stakeLegsOf(
      room({
        gameType: GameType.Ludo,
        opponentId: null,
        opponentIds: [JOINER, THIRD],
        stakeTokenChoices: {
          [JOINER]: StakeAsset.Usdt,
          [THIRD]: StakeAsset.Dai,
        },
      }),
    );
    expect(legs.map(leg => leg.asset)).toEqual([
      StakeAsset.Usdc,
      StakeAsset.Usdt,
      StakeAsset.Dai,
    ]);
  });
});
