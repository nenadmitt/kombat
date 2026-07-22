import { randomUUID } from 'crypto';

import { CacheStore } from './cache-store';

type Entry = { value: string; expiresAt: number | null };

/**
 * In-process CacheStore — the fallback when REDIS_URL is unset. Preserves
 * today's single-instance behavior: state lives (and dies) with the process.
 * Node is single-threaded, so tryLock's check-then-set is atomic without any
 * further coordination; the lock still matters because callers hold it across
 * awaits inside a read-mutate-write cycle.
 */
export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();
  private readonly deadlines = new Map<string, number>();

  ping(): Promise<void> {
    return Promise.resolve();
  }

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.read(key)?.value ?? null);
  }

  set(key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.entries.set(key, {
      value,
      expiresAt: ttlSeconds ? Date.now() + ttlSeconds * 1000 : null,
    });
    return Promise.resolve();
  }

  del(...keys: string[]): Promise<void> {
    for (const key of keys) {
      this.entries.delete(key);
    }
    return Promise.resolve();
  }

  tryLock(key: string, ttlMs: number): Promise<string | null> {
    if (this.read(key)) {
      return Promise.resolve(null);
    }
    const token = randomUUID();
    this.entries.set(key, { value: token, expiresAt: Date.now() + ttlMs });
    return Promise.resolve(token);
  }

  unlock(key: string, token: string): Promise<void> {
    if (this.read(key)?.value === token) {
      this.entries.delete(key);
    }
    return Promise.resolve();
  }

  addDeadline(member: string, at: number): Promise<void> {
    this.deadlines.set(member, at);
    return Promise.resolve();
  }

  removeDeadline(member: string): Promise<void> {
    this.deadlines.delete(member);
    return Promise.resolve();
  }

  popDueDeadlines(now: number, limit: number): Promise<string[]> {
    const due = [...this.deadlines.entries()]
      .filter(([, at]) => at <= now)
      .sort((a, b) => a[1] - b[1])
      .slice(0, limit)
      .map(([member]) => member);
    for (const member of due) {
      this.deadlines.delete(member);
    }
    return Promise.resolve(due);
  }

  /** Lazy expiry: entries are dropped when read past their TTL. */
  private read(key: string): Entry | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    return entry;
  }
}
