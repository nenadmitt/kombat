import { BadRequestException } from '@nestjs/common';
import { StakeAsset } from '@gaming-platform/core';

import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameRoomStatus, GameType } from '../db/types/game';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { WebsocketsService } from '../websockets';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { ChromaMatchService } from './chroma/chroma-match.service';
import { GamesService } from './games.service';
import { LudoMatchService } from './ludo/ludo-match.service';
import { RpsMatchService } from './rps/rps-match.service';
import { SalvoMatchService } from './salvo/salvo-match.service';
import { StakesService } from './stakes/stakes.service';

const CREATOR = '11111111-1111-4111-8111-111111111111';
const JOINER = '22222222-2222-4222-8222-222222222222';
const ROOM = '33333333-3333-4333-8333-333333333333';

const USDC_10 = '10000000';
const DAI_10 = '10000000000000000000';

/**
 * The joiner's token choice: what the server accepts, what it stores, and what
 * each player is then told they staked and won.
 */
describe('GamesService cross-stable joins', () => {
  let service: GamesService;
  let db: {
    findGameRoomById: jest.Mock;
    findGameRoomByIdFresh: jest.Mock;
    joinGameRoom: jest.Mock;
    appendGameRoomOpponent: jest.Mock;
    findCompletedGameRoomsForUser: jest.Mock;
    findMatchSettlementByRoomId: jest.Mock;
    findUserById: jest.Mock;
    findOpenGameRoomForUser: jest.Mock;
    findActiveGameRoomForParticipant: jest.Mock;
  };
  let stakes: { assertSufficientBalance: jest.Mock; beginFunding: jest.Mock };

  const room = (over: Partial<GameRoomEntity> = {}): GameRoomEntity =>
    ({
      id: ROOM,
      userId: CREATOR,
      opponentId: null,
      opponentIds: [],
      gameType: GameType.NavalBattle,
      status: GameRoomStatus.Pending,
      stakeToken: StakeAsset.Usdc,
      stakeAmount: USDC_10,
      stakeTokenChoices: null,
      winnerUserId: null,
      endReason: null,
      completedAt: null,
      isPrivate: false,
      code: 'ABCDEF',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      ...over,
    }) as unknown as GameRoomEntity;

  beforeEach(() => {
    db = {
      findGameRoomById: jest.fn().mockResolvedValue(room()),
      findGameRoomByIdFresh: jest.fn(),
      joinGameRoom: jest.fn().mockResolvedValue(true),
      appendGameRoomOpponent: jest.fn().mockResolvedValue(true),
      findCompletedGameRoomsForUser: jest.fn().mockResolvedValue([]),
      findMatchSettlementByRoomId: jest.fn().mockResolvedValue(null),
      findUserById: jest.fn().mockResolvedValue({ username: 'someone' }),
      // The joiner has no room of their own to give up.
      findOpenGameRoomForUser: jest.fn().mockResolvedValue(null),
      findActiveGameRoomForParticipant: jest.fn().mockResolvedValue(null),
    };
    db.findGameRoomByIdFresh.mockImplementation((id: string) =>
      db.findGameRoomById(id),
    );
    stakes = {
      assertSufficientBalance: jest.fn().mockResolvedValue(undefined),
      beginFunding: jest.fn().mockResolvedValue(undefined),
    };

    service = new GamesService(
      db as unknown as DbService,
      {
        assertNotInMaintenance: jest.fn().mockResolvedValue(undefined),
      } as unknown as MaintenanceService,
      {
        sendToUser: () => undefined,
        sendToChannel: () => undefined,
      } as unknown as WebsocketsService,
      {} as BattleshipMatchService,
      {} as ChromaMatchService,
      { getOrCreate: jest.fn() } as unknown as LudoMatchService,
      {} as RpsMatchService,
      {} as SalvoMatchService,
      stakes as unknown as StakesService,
    );
  });

  describe('joinRoom', () => {
    it('stakes the room token when the client sends no choice', async () => {
      await service.joinRoom(JOINER, ROOM);

      expect(stakes.assertSufficientBalance).toHaveBeenCalledWith(
        JOINER,
        StakeAsset.Usdc,
        USDC_10,
      );
      expect(db.joinGameRoom).toHaveBeenCalledWith(ROOM, JOINER, null);
    });

    it('records nothing when the choice matches the room token', async () => {
      await service.joinRoom(JOINER, ROOM, StakeAsset.Usdc);
      expect(db.joinGameRoom).toHaveBeenCalledWith(ROOM, JOINER, null);
    });

    it('checks the balance in the chosen token and records the choice', async () => {
      await service.joinRoom(JOINER, ROOM, StakeAsset.Dai);

      expect(stakes.assertSufficientBalance).toHaveBeenCalledWith(
        JOINER,
        StakeAsset.Dai,
        DAI_10,
      );
      expect(db.joinGameRoom).toHaveBeenCalledWith(
        ROOM,
        JOINER,
        StakeAsset.Dai,
      );
      expect(stakes.beginFunding).toHaveBeenCalledWith(
        expect.objectContaining({
          stakeTokenChoices: { [JOINER]: StakeAsset.Dai },
        }),
      );
    });

    it('rejects KOMBAT in a stable room before the seat flips', async () => {
      await expect(
        service.joinRoom(JOINER, ROOM, StakeAsset.Kombat),
      ).rejects.toThrow(BadRequestException);
      expect(db.joinGameRoom).not.toHaveBeenCalled();
      expect(stakes.assertSufficientBalance).not.toHaveBeenCalled();
    });

    it('rejects a stablecoin in a KOMBAT room', async () => {
      db.findGameRoomById.mockResolvedValue(
        room({ stakeToken: StakeAsset.Kombat, stakeAmount: DAI_10 }),
      );
      await expect(
        service.joinRoom(JOINER, ROOM, StakeAsset.Usdc),
      ).rejects.toThrow(BadRequestException);
      expect(db.joinGameRoom).not.toHaveBeenCalled();
    });

    it('ignores a choice sent for a free room', async () => {
      db.findGameRoomById.mockResolvedValue(
        room({ stakeToken: null, stakeAmount: null }),
      );
      await service.joinRoom(JOINER, ROOM, StakeAsset.Dai);

      expect(stakes.assertSufficientBalance).not.toHaveBeenCalled();
      expect(db.joinGameRoom).toHaveBeenCalledWith(ROOM, JOINER, null);
    });

    it('carries the choice into a multi-seat seat append', async () => {
      db.findGameRoomById.mockResolvedValue(
        room({ gameType: GameType.Ludo, playerCount: 4 }),
      );
      await service.joinRoom(JOINER, ROOM, StakeAsset.Usdt);

      expect(db.appendGameRoomOpponent).toHaveBeenCalledWith(
        ROOM,
        JOINER,
        StakeAsset.Usdt,
      );
    });
  });

  describe('getHistory', () => {
    const mixed = room({
      status: GameRoomStatus.Completed,
      opponentId: JOINER,
      stakeTokenChoices: { [JOINER]: StakeAsset.Dai },
      winnerUserId: JOINER,
      completedAt: new Date('2026-08-02T00:00:00Z'),
    });

    beforeEach(() => {
      db.findCompletedGameRoomsForUser.mockResolvedValue([mixed]);
      db.findMatchSettlementByRoomId.mockResolvedValue({
        payout: null,
        fee: null,
        payoutByAsset: {
          [StakeAsset.Usdc]: '9500000',
          [StakeAsset.Dai]: '9500000000000000000',
        },
        feeByAsset: {
          [StakeAsset.Usdc]: '500000',
          [StakeAsset.Dai]: '500000000000000000',
        },
      });
    });

    it('reports the winner their own token, with the whole prize valued in it', async () => {
      const [entry] = await service.getHistory(JOINER);

      expect(entry).toMatchObject({
        result: 'win',
        stakeToken: StakeAsset.Dai,
        stakeAmount: DAI_10,
        // 9.5 DAI + 9.5 USDC valued 1:1, less the 10 DAI staked.
        prizeDelta: '9000000000000000000',
      });
    });

    it('reports the loser their own token and only their own stake', async () => {
      const [entry] = await service.getHistory(CREATOR);

      expect(entry).toMatchObject({
        result: 'loss',
        stakeToken: StakeAsset.Usdc,
        stakeAmount: USDC_10,
        prizeDelta: `-${USDC_10}`,
      });
    });

    it('leaves a single-asset room on the scalar payout exactly as before', async () => {
      db.findCompletedGameRoomsForUser.mockResolvedValue([
        room({
          status: GameRoomStatus.Completed,
          opponentId: JOINER,
          winnerUserId: CREATOR,
          completedAt: new Date('2026-08-02T00:00:00Z'),
        }),
      ]);
      db.findMatchSettlementByRoomId.mockResolvedValue({
        payout: '19000000',
        fee: '1000000',
        payoutByAsset: null,
        feeByAsset: null,
      });

      const [entry] = await service.getHistory(CREATOR);

      expect(entry).toMatchObject({
        result: 'win',
        stakeToken: StakeAsset.Usdc,
        stakeAmount: USDC_10,
        prizeDelta: '9000000',
      });
    });

    it('estimates the winner at their own stake before settlement lands', async () => {
      db.findMatchSettlementByRoomId.mockResolvedValue({
        payout: null,
        fee: null,
        payoutByAsset: null,
        feeByAsset: null,
      });

      const [entry] = await service.getHistory(JOINER);
      expect(entry).toMatchObject({
        stakeToken: StakeAsset.Dai,
        prizeDelta: DAI_10,
      });
    });
  });
});
