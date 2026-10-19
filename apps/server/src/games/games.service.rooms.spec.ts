import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { ROOM_EVENTS, StakeAsset } from '@gaming-platform/core';

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

describe('GamesService room lifecycle', () => {
  let service: GamesService;
  let db: {
    findOpenGameRoomForUser: jest.Mock;
    findActiveGameRoomForParticipant: jest.Mock;
    findGameRoomById: jest.Mock;
    findGameRoomByIdFresh: jest.Mock;
    createGameRoom: jest.Mock;
    findPendingGameRoomByCode: jest.Mock;
    findGameRoomByCode: jest.Mock;
    joinGameRoom: jest.Mock;
    startGameRoom: jest.Mock;
  };
  let stakes: {
    validateStake: jest.Mock;
    assertSufficientBalance: jest.Mock;
    beginFunding: jest.Mock;
  };
  let sent: { userId: string; event: string }[];

  const baseRoom = (over: Partial<GameRoomEntity> = {}): GameRoomEntity =>
    ({
      id: ROOM,
      userId: CREATOR,
      opponentId: null,
      opponentIds: [],
      gameType: GameType.NavalBattle,
      status: GameRoomStatus.Pending,
      stakeToken: null,
      stakeAmount: null,
      isPrivate: false,
      code: 'ABCDEF',
      createdAt: new Date('2026-08-01T00:00:00Z'),
      ...over,
    }) as unknown as GameRoomEntity;

  beforeEach(() => {
    sent = [];
    db = {
      findOpenGameRoomForUser: jest.fn().mockResolvedValue(null),
      findActiveGameRoomForParticipant: jest.fn().mockResolvedValue(null),
      findGameRoomById: jest.fn().mockResolvedValue(null),
      createGameRoom: jest
        .fn()
        .mockImplementation(async (data: Partial<GameRoomEntity>) =>
          baseRoom(data),
        ),
      findPendingGameRoomByCode: jest.fn().mockResolvedValue(null),
      findGameRoomByCode: jest.fn().mockResolvedValue(null),
      joinGameRoom: jest.fn().mockResolvedValue(true),
      startGameRoom: jest.fn().mockResolvedValue(true),
      findGameRoomByIdFresh: jest.fn(),
    };
    db.findGameRoomByIdFresh.mockImplementation((id: string) =>
      db.findGameRoomById(id),
    );
    stakes = {
      validateStake: jest.fn(),
      assertSufficientBalance: jest.fn().mockResolvedValue(undefined),
      beginFunding: jest.fn().mockResolvedValue(undefined),
    };
    const websockets = {
      sendToUser: (userId: string, event: string) => {
        sent.push({ userId, event });
      },
      sendToChannel: () => undefined,
    } as unknown as WebsocketsService;

    service = new GamesService(
      db as unknown as DbService,
      {
        assertNotInMaintenance: jest.fn().mockResolvedValue(undefined),
      } as unknown as MaintenanceService,
      websockets,
      {} as BattleshipMatchService,
      {} as ChromaMatchService,
      { getOrCreate: jest.fn() } as unknown as LudoMatchService,
      {} as RpsMatchService,
      {} as SalvoMatchService,
      stakes as unknown as StakesService,
    );
  });

  describe('createRoom', () => {
    it('rejects a game type with no gateway behind it', async () => {
      await expect(
        service.createRoom(CREATOR, 'poker' as unknown as GameType),
      ).rejects.toThrow(BadRequestException);
      expect(db.createGameRoom).not.toHaveBeenCalled();
    });

    it('allows one open room per user', async () => {
      db.findActiveGameRoomForParticipant.mockResolvedValue(baseRoom());
      await expect(
        service.createRoom(CREATOR, GameType.NavalBattle),
      ).rejects.toThrow(ConflictException);
    });

    it('checks a staked creator can cover the stake but holds nothing yet', async () => {
      await service.createRoom(CREATOR, GameType.NavalBattle, {
        token: StakeAsset.Usdc,
        amount: '5000000',
      });

      expect(stakes.validateStake).toHaveBeenCalledWith(
        StakeAsset.Usdc,
        '5000000',
      );
      expect(stakes.assertSufficientBalance).toHaveBeenCalled();
      expect(stakes.beginFunding).not.toHaveBeenCalled();
      expect(db.createGameRoom).toHaveBeenCalledWith(
        expect.objectContaining({
          stakeToken: StakeAsset.Usdc,
          stakeAmount: '5000000',
        }),
      );
    });

    it('a creator who cannot cover the stake gets no room', async () => {
      stakes.assertSufficientBalance.mockRejectedValue(
        new ConflictException('broke'),
      );
      await expect(
        service.createRoom(CREATOR, GameType.NavalBattle, {
          token: StakeAsset.Usdc,
          amount: '5000000',
        }),
      ).rejects.toThrow('broke');
      expect(db.createGameRoom).not.toHaveBeenCalled();
    });
  });

  describe('joinRoom', () => {
    it('refuses the creator joining their own room', async () => {
      db.findGameRoomById.mockResolvedValue(baseRoom());
      await expect(service.joinRoom(CREATOR, ROOM)).rejects.toThrow(
        'your own game room',
      );
    });

    it('refuses a room that already started', async () => {
      db.findGameRoomById.mockResolvedValue(
        baseRoom({ status: GameRoomStatus.InProgress }),
      );
      await expect(service.joinRoom(JOINER, ROOM)).rejects.toThrow(
        'no longer accepting',
      );
    });

    it('rejects a broke joiner before the seat flips', async () => {
      db.findGameRoomById.mockResolvedValue(
        baseRoom({ stakeToken: StakeAsset.Usdc, stakeAmount: '5000000' }),
      );
      stakes.assertSufficientBalance.mockRejectedValue(
        new ConflictException('broke'),
      );

      await expect(service.joinRoom(JOINER, ROOM)).rejects.toThrow('broke');
      expect(db.joinGameRoom).not.toHaveBeenCalled();
    });

    it('a lost seat race bails out instead of overwriting the winner', async () => {
      db.findGameRoomById.mockResolvedValue(baseRoom());
      db.joinGameRoom.mockResolvedValue(false);

      await expect(service.joinRoom(JOINER, ROOM)).rejects.toThrow(
        'no longer accepting',
      );
      expect(sent).toHaveLength(0);
      expect(stakes.beginFunding).not.toHaveBeenCalled();
    });

    it('a free join tells the creator their opponent arrived', async () => {
      db.findGameRoomById.mockResolvedValue(baseRoom());
      await service.joinRoom(JOINER, ROOM);

      expect(sent).toEqual([
        { userId: CREATOR, event: ROOM_EVENTS.opponentJoined },
      ]);
      expect(stakes.beginFunding).not.toHaveBeenCalled();
    });

    it('a staked join funds instead of announcing directly', async () => {
      db.findGameRoomById.mockResolvedValue(
        baseRoom({ stakeToken: StakeAsset.Usdc, stakeAmount: '5000000' }),
      );
      await service.joinRoom(JOINER, ROOM);

      expect(stakes.beginFunding).toHaveBeenCalledWith(
        expect.objectContaining({ id: ROOM, opponentId: JOINER }),
      );
      expect(sent).toHaveLength(0);
    });
  });

  describe('startRoom (multi-seat early start)', () => {
    const ludoRoom = (over: Partial<GameRoomEntity> = {}) =>
      baseRoom({
        gameType: GameType.Ludo,
        opponentId: null,
        opponentIds: [JOINER],
        ...over,
      });

    it('only exists for multi-seat games', async () => {
      db.findGameRoomById.mockResolvedValue(baseRoom());
      await expect(service.startRoom(CREATOR, ROOM)).rejects.toThrow(
        'starts when the room is full',
      );
    });

    it('only the creator may start early', async () => {
      db.findGameRoomById.mockResolvedValue(ludoRoom());
      await expect(service.startRoom(JOINER, ROOM)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('needs at least one joiner', async () => {
      db.findGameRoomById.mockResolvedValue(ludoRoom({ opponentIds: [] }));
      await expect(service.startRoom(CREATOR, ROOM)).rejects.toThrow(
        'At least one other player',
      );
    });

    it('a lost start race stays silent - the winner handles kickoff', async () => {
      db.findGameRoomById.mockResolvedValue(ludoRoom());
      db.startGameRoom.mockResolvedValue(false);

      await service.startRoom(CREATOR, ROOM);
      expect(sent).toHaveLength(0);
    });

    it('a free start pushes started to every seat exactly once', async () => {
      db.findGameRoomById.mockResolvedValue(ludoRoom());
      await service.startRoom(CREATOR, ROOM);

      expect(sent).toEqual([
        { userId: CREATOR, event: ROOM_EVENTS.started },
        { userId: JOINER, event: ROOM_EVENTS.started },
      ]);
    });
  });
});
