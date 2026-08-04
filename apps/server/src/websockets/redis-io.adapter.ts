import { Logger } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import type { ServerOptions } from 'socket.io';

import { INSTANCE_ID } from '../instance-id';

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
    const logger = new Logger(RedisIoAdapter.name);
    const pubClient = new Redis(redisUrl, {
      connectTimeout: 10000,
      maxRetriesPerRequest: 2,
      lazyConnect: true,
    });
    const subClient = pubClient.duplicate();
    watch(pubClient, 'pub', logger);
    watch(subClient, 'sub', logger);
    try {
      await Promise.all([pubClient.connect(), subClient.connect()]);
    } catch (error) {
      pubClient.disconnect();
      subClient.disconnect();
      throw error;
    }
    this.adapterConstructor = createAdapter(pubClient, subClient);
    adapterState.mode = 'redis';
    logger.log(`socket.io adapter: redis (instance ${INSTANCE_ID})`);
  }

  override createIOServer(port: number, options?: ServerOptions): unknown {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}

/** Live adapter status, surfaced by the health probes. The cache client and
 *  these pub/sub clients connect independently, so cache health says nothing
 *  about whether cross-instance delivery works. */
export const adapterState: {
  mode: 'memory' | 'redis';
  pub: string;
  sub: string;
} = { mode: 'memory', pub: 'idle', sub: 'idle' };

function watch(client: Redis, role: 'pub' | 'sub', logger: Logger): void {
  for (const event of ['connect', 'ready', 'reconnecting', 'close', 'end']) {
    client.on(event, () => {
      adapterState[role] = event;
      logger.log(`redis ${role}: ${event}`);
    });
  }
  // ioredis emits 'error' on every failed reconnect; without a listener it
  // becomes an unhandled 'error' event and takes the process down.
  client.on('error', (error: Error) => {
    adapterState[role] = `error: ${error.message}`;
    logger.error(`redis ${role} error: ${error.message}`);
  });
}
