import { ConflictException, Injectable } from '@nestjs/common';

import { CacheDriver, CacheStore } from './stores/cache-store';

const LOCK_RETRIES = 5;
const LOCK_RETRY_MIN_MS = 50;
const LOCK_RETRY_MAX_MS = 250;

@Injectable()
export class CacheService {
  constructor(
    private readonly store: CacheStore,
    public readonly driver: CacheDriver,
  ) {}

  ping(): Promise<void> {
    return this.store.ping();
  }

  get(key: string): Promise<string | null> {
    return this.store.get(key);
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    return this.store.set(key, value, ttlSeconds);
  }

  del(...keys: string[]): Promise<void> {
    return this.store.del(...keys);
  }

  async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.store.get(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  }

  setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    return this.store.set(key, JSON.stringify(value), ttlSeconds);
  }

  // Throws ConflictException when the lock can't be acquired; the caller should retry the whole operation.
  async withLock<T>(
    key: string,
    ttlMs: number,
    fn: () => Promise<T>,
  ): Promise<T> {
    const token = await this.acquireLock(key, ttlMs);
    try {
      return await fn();
    } finally {
      await this.store.unlock(key, token);
    }
  }

  addDeadline(member: string, at: number): Promise<void> {
    return this.store.addDeadline(member, at);
  }

  removeDeadline(member: string): Promise<void> {
    return this.store.removeDeadline(member);
  }

  popDueDeadlines(now: number, limit: number): Promise<string[]> {
    return this.store.popDueDeadlines(now, limit);
  }

  private async acquireLock(key: string, ttlMs: number): Promise<string> {
    for (let attempt = 0; ; attempt++) {
      const token = await this.store.tryLock(key, ttlMs);
      if (token) {
        return token;
      }
      if (attempt >= LOCK_RETRIES) {
        throw new ConflictException(
          'The game is busy processing another action — try again.',
        );
      }
      const jitter =
        LOCK_RETRY_MIN_MS +
        Math.random() * (LOCK_RETRY_MAX_MS - LOCK_RETRY_MIN_MS);
      await new Promise(resolve => setTimeout(resolve, jitter));
    }
  }
}
