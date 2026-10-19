import { StakeAsset } from '@gaming-platform/core';
import { DataSource } from 'typeorm';

import { CacheService } from '../cache';
import { createTestDataSource, testUserId } from '../stake-pot/test/db-harness';
import { DbService } from './db.service';
import { AppSettingEntity } from './entities/app-setting.entity';
import { EmailLoginTokenEntity } from './entities/email-login-token.entity';
import { GameRoomEntity } from './entities/game-room.entity';
import { MatchSettlementEntity } from './entities/match-settlement.entity';
import { RefreshTokenEntity } from './entities/refresh-token.entity';
import { UserEntity } from './entities/user.entity';
import { WalletEntity } from './entities/wallet.entity';
import { GameRoomStatus, GameType, SettlementStatus } from './types/game';

const CREATOR = testUserId('host');
const JOINER = testUserId('guest');
const THIRD = testUserId('third');

const USDC_10 = '10000000';
const DAI_10 = '10000000000000000000';

describe('DbService stake token choices', () => {
  let dataSource: DataSource;
  let service: DbService;
  let rooms: ReturnType<DataSource['getRepository']>;

  beforeAll(async () => {
    dataSource = await createTestDataSource();
    rooms = dataSource.getRepository(GameRoomEntity);
    service = new DbService(
      dataSource,
      dataSource.getRepository(UserEntity),
      dataSource.getRepository(EmailLoginTokenEntity),
      dataSource.getRepository(RefreshTokenEntity),
      dataSource.getRepository(WalletEntity),
      dataSource.getRepository(GameRoomEntity),
      dataSource.getRepository(MatchSettlementEntity),
      dataSource.getRepository(AppSettingEntity),
      {
        getJson: async () => null,
        setJson: async () => undefined,
        del: async () => undefined,
      } as unknown as CacheService,
    );
  });

  afterAll(async () => {
    await dataSource.query(
      'TRUNCATE "match_settlements", "game_rooms" RESTART IDENTITY CASCADE',
    );
    await dataSource.destroy();
  });

  beforeEach(async () => {
    await dataSource.query(
      'TRUNCATE "match_settlements", "game_rooms" RESTART IDENTITY CASCADE',
    );
  });

  const createRoom = (over: Partial<GameRoomEntity> = {}) =>
    service.createGameRoom({
      userId: CREATOR,
      gameType: GameType.NavalBattle,
      status: GameRoomStatus.Pending,
      playerCount: 2,
      stakeToken: StakeAsset.Usdc,
      stakeAmount: USDC_10,
      ...over,
    } as Parameters<DbService['createGameRoom']>[0]);

  const reload = (id: string) =>
    rooms.findOneByOrFail({ id }) as Promise<GameRoomEntity>;

  it('leaves the column null when the joiner takes the room token', async () => {
    const room = await createRoom();

    expect(await service.joinGameRoom(room.id, JOINER)).toBe(true);

    const updated = await reload(room.id);
    expect(updated.opponentId).toBe(JOINER);
    expect(updated.status).toBe(GameRoomStatus.InProgress);
    expect(updated.stakeTokenChoices).toBeNull();
  });

  it('stores the chosen token in the same update that seats the joiner', async () => {
    const room = await createRoom();

    expect(await service.joinGameRoom(room.id, JOINER, StakeAsset.Dai)).toBe(
      true,
    );

    const updated = await reload(room.id);
    expect(updated.opponentId).toBe(JOINER);
    expect(updated.status).toBe(GameRoomStatus.InProgress);
    expect(updated.stakeTokenChoices).toEqual({ [JOINER]: StakeAsset.Dai });
  });

  it('does not seat a second joiner, nor record their token', async () => {
    const room = await createRoom();
    await service.joinGameRoom(room.id, JOINER, StakeAsset.Dai);

    expect(await service.joinGameRoom(room.id, THIRD, StakeAsset.Usdt)).toBe(
      false,
    );
    expect((await reload(room.id)).stakeTokenChoices).toEqual({
      [JOINER]: StakeAsset.Dai,
    });
  });

  it('accumulates one entry per multi-seat joiner', async () => {
    const room = await createRoom({ gameType: GameType.Ludo, playerCount: 4 });

    await service.appendGameRoomOpponent(room.id, JOINER, StakeAsset.Dai);
    await service.appendGameRoomOpponent(room.id, THIRD, StakeAsset.Usdt);

    expect((await reload(room.id)).stakeTokenChoices).toEqual({
      [JOINER]: StakeAsset.Dai,
      [THIRD]: StakeAsset.Usdt,
    });
  });

  it('keeps the column null when multi-seat joiners take the room token', async () => {
    const room = await createRoom({ gameType: GameType.Ludo, playerCount: 4 });

    await service.appendGameRoomOpponent(room.id, JOINER);

    expect((await reload(room.id)).stakeTokenChoices).toBeNull();
  });

  it('drops a leaver choice so the room stops looking mixed', async () => {
    const room = await createRoom({ gameType: GameType.Ludo, playerCount: 4 });
    await service.appendGameRoomOpponent(room.id, JOINER, StakeAsset.Dai);
    await service.appendGameRoomOpponent(room.id, THIRD, StakeAsset.Usdt);

    await service.removeGameRoomOpponent(room.id, THIRD);
    expect((await reload(room.id)).stakeTokenChoices).toEqual({
      [JOINER]: StakeAsset.Dai,
    });

    await service.removeGameRoomOpponent(room.id, JOINER);
    expect((await reload(room.id)).stakeTokenChoices).toBeNull();
  });

  describe('findStakeNetByTokenForUser', () => {
    const settle = (roomId: string, patch: Partial<MatchSettlementEntity>) =>
      dataSource.getRepository(MatchSettlementEntity).save(
        dataSource.getRepository(MatchSettlementEntity).create({
          roomId,
          status: SettlementStatus.Settled,
          ...patch,
        }),
      );

    it('nets a single-asset room off the scalar payout, as before', async () => {
      const room = await createRoom({
        status: GameRoomStatus.Completed,
        opponentId: JOINER,
        winnerUserId: CREATOR,
      });
      await settle(room.id, { payout: '19000000', fee: '1000000' });

      expect(await service.findStakeNetByTokenForUser(CREATOR)).toEqual([
        { stakeToken: StakeAsset.Usdc, net: '9000000' },
      ]);
      expect(await service.findStakeNetByTokenForUser(JOINER)).toEqual([
        { stakeToken: StakeAsset.Usdc, net: '-10000000' },
      ]);
    });

    it('nets a mixed room per seat, each in its own token', async () => {
      const room = await createRoom({
        status: GameRoomStatus.Completed,
        opponentId: JOINER,
        winnerUserId: JOINER,
        stakeTokenChoices: { [JOINER]: StakeAsset.Dai },
      });
      await settle(room.id, {
        payoutByAsset: {
          [StakeAsset.Usdc]: '9500000',
          [StakeAsset.Dai]: '9500000000000000000',
        },
        feeByAsset: {
          [StakeAsset.Usdc]: '500000',
          [StakeAsset.Dai]: '500000000000000000',
        },
      });

      expect(
        (await service.findStakeNetByTokenForUser(JOINER)).sort(
          (a, b) => a.stakeToken - b.stakeToken,
        ),
      ).toEqual([
        { stakeToken: StakeAsset.Usdc, net: '9500000' },
        { stakeToken: StakeAsset.Dai, net: '-500000000000000000' },
      ]);
      expect(await service.findStakeNetByTokenForUser(CREATOR)).toEqual([
        { stakeToken: StakeAsset.Usdc, net: '-10000000' },
      ]);
    });

    it('scores a mixed room in the rankings from the per-asset payout', async () => {
      const room = await createRoom({
        status: GameRoomStatus.Completed,
        opponentId: JOINER,
        winnerUserId: JOINER,
        stakeTokenChoices: { [JOINER]: StakeAsset.Dai },
      });
      await settle(room.id, {
        payoutByAsset: {
          [StakeAsset.Usdc]: '9500000',
          [StakeAsset.Dai]: '9500000000000000000',
        },
      });

      const ranked = await service.findRankings({ limit: 10, offset: 0 });
      const winner = ranked.find(entry => entry.userId === JOINER)!;
      const loser = ranked.find(entry => entry.userId === CREATOR)!;
      expect(winner.coinPoints).toBe(9);
      expect(winner.playPoints).toBe(10);
      expect(loser.coinPoints).toBe(0);
    });

    it('adds a mixed room to the single-asset totals for the same token', async () => {
      const plain = await createRoom({
        status: GameRoomStatus.Completed,
        opponentId: JOINER,
        winnerUserId: JOINER,
      });
      await settle(plain.id, { payout: '19000000', fee: '1000000' });
      const mixed = await createRoom({
        status: GameRoomStatus.Completed,
        opponentId: JOINER,
        winnerUserId: CREATOR,
        stakeTokenChoices: { [JOINER]: StakeAsset.Dai },
      });
      await settle(mixed.id, {
        payoutByAsset: {
          [StakeAsset.Usdc]: '9500000',
          [StakeAsset.Dai]: '9500000000000000000',
        },
      });

      expect(await service.findStakeNetByTokenForUser(JOINER)).toEqual([
        { stakeToken: StakeAsset.Usdc, net: '9000000' },
        { stakeToken: StakeAsset.Dai, net: `-${DAI_10}` },
      ]);
    });
  });
});
