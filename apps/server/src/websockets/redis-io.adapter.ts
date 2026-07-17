import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

/**
 * socket.io adapter backed by Redis pub/sub, so broadcasts reach sockets
 * connected to other server instances. Without it, socket.io tracks rooms in
 * process memory and an emit from instance 1 never reaches a socket on
 * instance 2.
 *
 * `connect()` must resolve before the app starts listening. It uses its own
 * two Redis connections (pub + sub) - the cache store's client can't be
 * reused because a subscribing connection is locked out of regular commands.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connect(redisUrl: string): Promise<void> {
    const pubClient = new Redis(redisUrl, {
      connectTimeout: 2000,
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    const subClient = pubClient.duplicate();
    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
    } catch (error) {
      pubClient.disconnect();
      subClient.disconnect();
      throw error;
    }
    this.adapterConstructor = createAdapter(pubClient, subClient);
    new Logger(RedisIoAdapter.name).log('socket.io adapter: redis');
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
