import { LOBBY_CHANNEL, LOBBY_EVENTS, ROOM_EVENTS, StakeAsset } from '@gaming-platform/core';

import { CacheService, roomAbandonMember } from '../cache';
import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameRoomStatus, GameType } from '../db/types/game';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { WebsocketsService } from '../websockets';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { ChromaMatchService } from './chroma/chroma-match.service';
import { GamesService } from './games.service';
import { LudoMatchService } from './ludo/ludo-match.service';
import {
  PENDING_ROOM_ABANDON_SECONDS,
  RoomAbandonService,
} from './room-abandon.service';
import { RpsMatchService } from './rps/rps-match.service';
import { StakesService } from './stakes/stakes.service';

const CREATOR = '11111111-1111-4111-8111-111111111111';
const JOINER = '22222222-2222-4222-8222-222222222222';
const ROOM = '33333333-3333-4333-8333-333333333333';
const NOW = new Date('2026-08-10T12:00:00Z').getTime();

/**
 * A disconnect must never cost anyone a live room, so the fire path re-checks
 * everything: these cover the schedule filter and every reason enforcement
 * drops out - plus the promise that cleanup goes through the same
 * GamesService calls (and therefore the same events) as the manual endpoints.
 */
describe('RoomAbandonService', () => {
  let service: RoomAbandonService;
  let games: GamesService;
  let scheduled: { member: string; at: number }[];
  let online: Set<string>;
  let channelEvents: { channel: string; event: string; payload: unknown }[];
  let userEvents: { userId: string; event: string; payload: unknown }[];
  let disconnectListener: ((userId: string) => void) | undefined;

  let db: {
    findActiveGameRoomForParticipant: jest.Mock;
    findGameRoomByIdFresh: jest.Mock;
    findGameRoomById: jest.Mock;
    findGameRoomForUser: jest.Mock;
    deleteGameRoom: jest.Mock;
    removeGameRoomOpponent: jest.Mock;
  };
  let stakes: {
    beginFunding: jest.Mock;
    completeMatch: jest.Mock;
  };

  const pendingRoom = (over: Partial<GameRoomEntity> = {}): GameRoomEntity =>
    ({
      id: ROOM,
      userId: CREATOR,
      opponentId: null,
      opponentIds: [],
      gameType: GameType.NavalBattle,
      status: GameRoomStatus.Pending,
      playerCount: 2,
      stakeToken: null,
      stakeAmount: null,
      isPrivate: false,
      code: 'ABCDEF',
      createdAt: new Date('2026-08-10T11:00:00Z'),
      ...over,
    }) as unknown as GameRoomEntity;

  const ludoRoom = (over: Partial<GameRoomEntity> = {}): GameRoomEntity =>
    pendingRoom({
      gameType: GameType.Ludo,
      playerCount: 4,
      opponentIds: [JOINER],
      ...over,
    });

  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    scheduled = [];
    online = new Set();
    channelEvents = [];
    userEvents = [];
    disconnectListener = undefined;

    db = {
      findActiveGameRoomForParticipant: jest.fn().mockResolvedValue(null),
      findGameRoomByIdFresh: jest.fn().mockResolvedValue(null),
      findGameRoomById: jest.fn().mockResolvedValue(null),
      findGameRoomForUser: jest.fn().mockResolvedValue(null),
      deleteGameRoom: jest.fn().mockResolvedValue(undefined),
      removeGameRoomOpponent: jest.fn().mockResolvedValue(true),
    };
    stakes = {
      beginFunding: jest.fn().mockResolvedValue(undefined),
      completeMatch: jest.fn().mockResolvedValue(undefined),
    };

    const cache = {
      addDeadline: async (member: string, at: number) => {
        scheduled.push({ member, at });
      },
    } as unknown as CacheService;

    const websockets = {
      onLastSocketClosed: (listener: (userId: string) => void) => {
        disconnectListener = listener;
      },
      isUserOnline: async (userId: string) => online.has(userId),
      sendToChannel: (channel: string, event: string, payload: unknown) => {
        channelEvents.push({ channel, event, payload });
      },
      sendToUser: (userId: string, event: string, payload: unknown) => {
        userEvents.push({ userId, event, payload });
      },
    } as unknown as WebsocketsService;

    games = new GamesService(
      db as unknown as DbService,
      {
        assertNotInMaintenance: jest.fn().mockResolvedValue(undefined),
      } as unknown as MaintenanceService,
      websockets,
      {} as BattleshipMatchService,
      {} as ChromaMatchService,
      {} as LudoMatchService,
      {} as RpsMatchService,
      stakes as unknown as StakesService,
    );

    service = new RoomAbandonService(
      cache,
      db as unknown as DbService,
      websockets,
      games,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('scheduling on disconnect', () => {
    it('registers itself on the last-socket-closed seam', async () => {
      db.findActiveGameRoomForParticipant.mockResolvedValue(pendingRoom());
      service.onModuleInit();
      disconnectListener?.(CREATOR);
      await Promise.resolve();

      expect(scheduled).toEqual([
        {
          member: roomAbandonMember(ROOM, CREATOR),
          at: NOW + PENDING_ROOM_ABANDON_SECONDS * 1000,
        },
      ]);
    });

    it('schedules the grace window for a pending room creator', async () => {
      db.findActiveGameRoomForParticipant.mockResolvedValue(pendingRoom());
      await service.schedule(CREATOR);

      expect(scheduled).toEqual([
        {
          member: roomAbandonMember(ROOM, CREATOR),
          at: NOW + PENDING_ROOM_ABANDON_SECONDS * 1000,
        },
      ]);
    });

    it('schedules for a seated joiner of a waiting multi-seat room', async () => {
      db.findActiveGameRoomForParticipant.mockResolvedValue(ludoRoom());
      await service.schedule(JOINER);

      expect(scheduled).toEqual([
        {
          member: roomAbandonMember(ROOM, JOINER),
          at: NOW + PENDING_ROOM_ABANDON_SECONDS * 1000,
        },
      ]);
    });

    it('schedules nothing for a started match - the turn clock owns that', async () => {
      db.findActiveGameRoomForParticipant.mockResolvedValue(
        pendingRoom({
          status: GameRoomStatus.InProgress,
          opponentId: JOINER,
        }),
      );
      await service.schedule(CREATOR);

      expect(scheduled).toHaveLength(0);
    });

    it('schedules nothing for a user with no active room', async () => {
      await service.schedule(CREATOR);

      expect(scheduled).toHaveLength(0);
    });
  });

  describe('enforcement re-checks', () => {
    it('closes a still-abandoned pending room through closeRoom', async () => {
      db.findGameRoomByIdFresh.mockResolvedValue(pendingRoom());
      db.findGameRoomForUser.mockResolvedValue(pendingRoom());
      await service.enforce(ROOM, CREATOR);

      expect(db.deleteGameRoom).toHaveBeenCalledWith(ROOM);
      expect(channelEvents).toEqual([
        {
          channel: LOBBY_CHANNEL,
          event: LOBBY_EVENTS.roomRemoved,
          payload: { roomId: ROOM },
        },
      ]);
    });

    it('emits exactly what the manual close emits', async () => {
      db.findGameRoomByIdFresh.mockResolvedValue(pendingRoom());
      db.findGameRoomForUser.mockResolvedValue(pendingRoom());
      await service.enforce(ROOM, CREATOR);
      const abandoned = { channelEvents, userEvents };

      channelEvents = [];
      userEvents = [];
      db.deleteGameRoom.mockClear();
      await games.closeRoom(CREATOR, ROOM);

      expect(abandoned.channelEvents).toEqual(channelEvents);
      expect(abandoned.userEvents).toEqual(userEvents);
      expect(db.deleteGameRoom).toHaveBeenCalledWith(ROOM);
    });

    it('frees a seated joiner through leaveRoom', async () => {
      db.findGameRoomByIdFresh.mockResolvedValue(ludoRoom());
      db.findGameRoomById.mockResolvedValue(ludoRoom({ opponentIds: [] }));
      await service.enforce(ROOM, JOINER);

      expect(db.removeGameRoomOpponent).toHaveBeenCalledWith(ROOM, JOINER);
      expect(userEvents).toEqual([
        {
          userId: CREATOR,
          event: ROOM_EVENTS.playerLeft,
          payload: {
            roomId: ROOM,
            userId: JOINER,
            joinedCount: 1,
            playerCount: 4,
          },
        },
      ]);
    });

    it('does nothing when the user reconnected before the deadline fired', async () => {
      online.add(CREATOR);
      db.findGameRoomByIdFresh.mockResolvedValue(pendingRoom());
      await service.enforce(ROOM, CREATOR);

      expect(db.findGameRoomByIdFresh).not.toHaveBeenCalled();
      expect(db.deleteGameRoom).not.toHaveBeenCalled();
      expect(channelEvents).toHaveLength(0);
    });

    it('does nothing when the room started while the player was away', async () => {
      db.findGameRoomByIdFresh.mockResolvedValue(
        pendingRoom({
          status: GameRoomStatus.InProgress,
          opponentId: JOINER,
        }),
      );
      await service.enforce(ROOM, CREATOR);

      expect(db.deleteGameRoom).not.toHaveBeenCalled();
      expect(channelEvents).toHaveLength(0);
    });

    it('does nothing when the room is already gone', async () => {
      await service.enforce(ROOM, CREATOR);

      expect(db.deleteGameRoom).not.toHaveBeenCalled();
      expect(channelEvents).toHaveLength(0);
    });

    it('does nothing when the user is no longer in the room', async () => {
      db.findGameRoomByIdFresh.mockResolvedValue(pendingRoom());
      await service.enforce(ROOM, JOINER);

      expect(db.deleteGameRoom).not.toHaveBeenCalled();
      expect(db.removeGameRoomOpponent).not.toHaveBeenCalled();
    });

    it('swallows a race lost to a join or a manual close', async () => {
      db.findGameRoomByIdFresh.mockResolvedValue(pendingRoom());
      db.findGameRoomForUser.mockResolvedValue(null);

      await expect(service.enforce(ROOM, CREATOR)).resolves.toBeUndefined();
      expect(db.deleteGameRoom).not.toHaveBeenCalled();
    });

    it('treats a staked pending room exactly like a free one - no ledger touched', async () => {
      const staked = pendingRoom({
        stakeToken: StakeAsset.Usdc,
        stakeAmount: '5000000',
      });
      db.findGameRoomByIdFresh.mockResolvedValue(staked);
      db.findGameRoomForUser.mockResolvedValue(staked);
      await service.enforce(ROOM, CREATOR);

      expect(db.deleteGameRoom).toHaveBeenCalledWith(ROOM);
      expect(stakes.completeMatch).not.toHaveBeenCalled();
      expect(stakes.beginFunding).not.toHaveBeenCalled();
      expect(channelEvents).toEqual([
        {
          channel: LOBBY_CHANNEL,
          event: LOBBY_EVENTS.roomRemoved,
          payload: { roomId: ROOM },
        },
      ]);
    });
  });
});
