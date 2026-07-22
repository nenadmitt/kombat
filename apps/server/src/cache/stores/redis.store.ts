import { randomUUID } from 'crypto';
import type Redis from 'ioredis';

import { CacheStore, DEADLINES_KEY } from './cache-store';

/** ioredis client extended with the Lua commands registered below. */
type RedisWithCommands = Redis & {
  unlockIfMatch(key: string, token: string): Promise<number>;
  popDueDeadlines(key: string, now: number, limit: number): Promise<string[]>;
};

/** Release the lock only if we still hold it (token compare-and-del). */
const UNLOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

/** Atomically take (read + remove) every member due at/before ARGV[1]. */
const POP_DUE_LUA = `
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[2]))
if #due > 0 then
  redis.call('ZREM', KEYS[1], unpack(due))
end
return due
`;

export class RedisCacheStore implements CacheStore {
  private readonly client: RedisWithCommands;

  constructor(client: Redis) {
    client.defineCommand('unlockIfMatch', { numberOfKeys: 1, lua: UNLOCK_LUA });
    client.defineCommand('popDueDeadlines', {
      numberOfKeys: 1,
      lua: POP_DUE_LUA,
    });
    this.client = client as RedisWithCommands;
  }

  async ping(): Promise<void> {
    await this.client.ping();
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    if (ttlSeconds) {
      await this.client.set(key, value, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, value);
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (keys.length > 0) {
      await this.client.del(...keys);
    }
  }

  async tryLock(key: string, ttlMs: number): Promise<string | null> {
    const token = randomUUID();
    const result = await this.client.set(key, token, 'PX', ttlMs, 'NX');
    return result === 'OK' ? token : null;
  }

  async unlock(key: string, token: string): Promise<void> {
    await this.client.unlockIfMatch(key, token);
  }

  async addDeadline(member: string, at: number): Promise<void> {
    await this.client.zadd(DEADLINES_KEY, at, member);
  }

  async removeDeadline(member: string): Promise<void> {
    await this.client.zrem(DEADLINES_KEY, member);
  }

  async popDueDeadlines(now: number, limit: number): Promise<string[]> {
    return this.client.popDueDeadlines(DEADLINES_KEY, now, limit);
  }
}
