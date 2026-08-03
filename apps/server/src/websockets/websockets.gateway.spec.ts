import { JwtService } from '@nestjs/jwt';
import type { Server } from 'socket.io';

import { CacheService } from '../cache';
import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { channelRoom, gameChannel, userRoom } from './rooms.util';
import { WebsocketsGateway } from './websockets.gateway';
import { WebsocketsService } from './websockets.service';

const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const OTHER = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const ROOM = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';

type TestClient = {
  id: string;
  data: { userId?: string };
  handshake: { auth: Record<string, unknown>; headers: Record<string, string> };
  join: jest.Mock;
  disconnect: jest.Mock;
};

/**
 * The socket trust boundary: who gets a connection, and which client-supplied
 * channel names an authenticated socket may subscribe to.
 */
describe('WebsocketsGateway', () => {
  let gateway: WebsocketsGateway;
  let sequence: [string, string][];
  let disconnectedRooms: string[];
  let connected: string[];
  let disconnected: string[];
  let roomLookups: number;
  let dbRoom: GameRoomEntity | null;

  const makeClient = (token?: string): TestClient => {
    const client: TestClient = {
      id: 'socket-1',
      data: {},
      handshake: { auth: token ? { token } : {}, headers: {} },
      join: jest.fn(async (room: string) => {
        sequence.push(['join', room]);
      }),
      disconnect: jest.fn(),
    };
    return client;
  };

  beforeEach(() => {
    sequence = [];
    disconnectedRooms = [];
    connected = [];
    disconnected = [];
    roomLookups = 0;
    dbRoom = null;

    const jwt = {
      verifyAsync: async (token: string) => {
        if (token !== 'valid') {
          throw new Error('bad token');
        }
        return { sub: USER };
      },
    } as unknown as JwtService;

    const websockets = {
      markConnected: (id: string) => connected.push(id),
      markDisconnected: (id: string) => disconnected.push(id),
      sendToChannel: () => undefined,
      sendToUser: (id: string, event: string) =>
        sequence.push([event, id]),
      setServer: () => undefined,
    } as unknown as WebsocketsService;

    const db = {
      findGameRoomById: async () => {
        roomLookups += 1;
        return dbRoom;
      },
    } as unknown as DbService;

    gateway = new WebsocketsGateway(
      jwt,
      websockets,
      {} as CacheService,
      db,
    );
    (gateway as unknown as { server: Server }).server = {
      in: (room: string) => ({
        disconnectSockets: () => {
          sequence.push(['kick', room]);
          disconnectedRooms.push(room);
        },
      }),
    } as unknown as Server;
  });

  describe('handleConnection', () => {
    it('drops a socket with no token before it joins anything', async () => {
      const client = makeClient();
      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
      expect(connected).toHaveLength(0);
    });

    it('drops a socket whose token does not verify', async () => {
      const client = makeClient('forged');
      await gateway.handleConnection(client as never);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('accepts a bearer header as the fallback token carrier', async () => {
      const client = makeClient();
      client.handshake.headers.authorization = 'Bearer valid';
      await gateway.handleConnection(client as never);

      expect(client.data.userId).toBe(USER);
      expect(connected).toEqual([USER]);
    });

    it('kicks the account predecessors before the new socket joins', async () => {
      const client = makeClient('valid');
      await gateway.handleConnection(client as never);

      // Kick-then-join is the whole guarantee: reversed, the new socket
      // would be in the room it disconnects.
      expect(sequence).toEqual([
        ['kick', userRoom(USER)],
        ['join', userRoom(USER)],
      ]);
    });
  });

  describe('handleDisconnect', () => {
    it('marks an authenticated socket disconnected', () => {
      const client = makeClient('valid');
      client.data.userId = USER;
      gateway.handleDisconnect(client as never);
      expect(disconnected).toEqual([USER]);
    });

    it('ignores a socket that never authenticated', () => {
      gateway.handleDisconnect(makeClient() as never);
      expect(disconnected).toHaveLength(0);
    });
  });

  describe('channel subscription', () => {
    const join = async (client: TestClient, channel: string) =>
      gateway.handleJoinChannel(client as never, { channel });

    const authed = () => {
      const client = makeClient('valid');
      client.data.userId = USER;
      return client;
    };

    it('lets any authenticated socket join a non-game channel', async () => {
      const client = authed();
      await join(client, 'lobby');
      expect(client.join).toHaveBeenCalledWith(channelRoom('lobby'));
    });

    it('refuses a game channel to a non-participant', async () => {
      dbRoom = {
        id: ROOM,
        userId: OTHER,
        opponentId: null,
        opponentIds: [],
      } as unknown as GameRoomEntity;
      const client = authed();
      await join(client, gameChannel(ROOM));
      expect(client.join).not.toHaveBeenCalled();
    });

    it('admits a seated player to their game channel', async () => {
      dbRoom = {
        id: ROOM,
        userId: OTHER,
        opponentId: USER,
        opponentIds: [],
      } as unknown as GameRoomEntity;
      const client = authed();
      await join(client, gameChannel(ROOM));
      expect(client.join).toHaveBeenCalledWith(channelRoom(gameChannel(ROOM)));
    });

    it('rejects a malformed room id without touching the database', async () => {
      const client = authed();
      await join(client, gameChannel('not-a-uuid; DROP TABLE'));
      expect(client.join).not.toHaveBeenCalled();
      expect(roomLookups).toBe(0);
    });

    it('refuses an unauthenticated socket outright', async () => {
      const client = makeClient('valid');
      await join(client, 'lobby');
      expect(client.join).not.toHaveBeenCalled();
    });
  });
});
