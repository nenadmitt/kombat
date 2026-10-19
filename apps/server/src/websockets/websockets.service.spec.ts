import type { Server } from 'socket.io';

import { userRoom } from './rooms.util';
import { WebsocketsService } from './websockets.service';

const USER = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

describe('WebsocketsService presence', () => {
  let service: WebsocketsService;
  let gone: string[];
  let fetched: string[];
  let remoteSockets: unknown[];
  let fetchError: Error | null;

  const withServer = (): void => {
    service.setServer({
      in: (room: string) => ({
        fetchSockets: async () => {
          fetched.push(room);
          if (fetchError) {
            throw fetchError;
          }
          return remoteSockets;
        },
      }),
    } as unknown as Server);
  };

  beforeEach(() => {
    service = new WebsocketsService();
    gone = [];
    fetched = [];
    remoteSockets = [];
    fetchError = null;
    service.onLastSocketClosed(userId => gone.push(userId));
  });

  it('announces a user gone when their last socket closes', () => {
    service.markConnected(USER);
    service.markDisconnected(USER);

    expect(gone).toEqual([USER]);
    expect(service.getOnlineUserIds()).toEqual([]);
  });

  it('stays silent while a replacement socket overlaps the kicked one', () => {
    service.markConnected(USER);
    service.markConnected(USER);
    service.markDisconnected(USER);

    expect(gone).toEqual([]);
    expect(service.getOnlineUserIds()).toEqual([USER]);
  });

  it('answers online from this instance without asking the adapter', async () => {
    withServer();
    service.markConnected(USER);

    await expect(service.isUserOnline(USER)).resolves.toBe(true);
    expect(fetched).toEqual([]);
  });

  it('asks the adapter for a user with no socket here', async () => {
    withServer();
    remoteSockets = [{ id: 'socket-on-another-instance' }];

    await expect(service.isUserOnline(USER)).resolves.toBe(true);
    expect(fetched).toEqual([userRoom(USER)]);
  });

  it('reports offline only when the adapter finds no socket anywhere', async () => {
    withServer();

    await expect(service.isUserOnline(USER)).resolves.toBe(false);
  });

  it('reports online when the adapter cannot answer', async () => {
    withServer();
    fetchError = new Error('adapter timeout');

    await expect(service.isUserOnline(USER)).resolves.toBe(true);
  });
});
