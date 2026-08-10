import { ConflictException } from '@nestjs/common';

import { CacheService } from './cache.service';
import {
  deadlineMember,
  parseDeadlineMember,
  roomAbandonMember,
} from './stores/cache-store';
import { InMemoryCacheStore } from './stores/memory.store';

/**
 * Every gameplay mutation runs inside withLock over one of these stores, so
 * this is the concurrency contract the whole match layer stands on. Redis gets
 * the same guarantees from SET NX and a token-checked unlock; only the
 * in-process store is testable here.
 */
describe('CacheService over InMemoryCacheStore', () => {
  let service: CacheService;
  let store: InMemoryCacheStore;

  beforeEach(() => {
    store = new InMemoryCacheStore();
    service = new CacheService(store, 'memory');
  });

  describe('withLock', () => {
    it('serializes two holders of the same key', async () => {
      const order: string[] = [];
      const first = service.withLock('room', 5_000, async () => {
        order.push('first-in');
        await new Promise(resolve => setTimeout(resolve, 30));
        order.push('first-out');
      });
      // Give the first call the tick it needs to take the lock.
      await new Promise(resolve => setTimeout(resolve, 5));
      const second = service.withLock('room', 5_000, async () => {
        order.push('second-in');
      });

      await Promise.all([first, second]);
      expect(order).toEqual(['first-in', 'first-out', 'second-in']);
    });

    it('does not serialize different keys', async () => {
      const order: string[] = [];
      let release!: () => void;
      const gate = new Promise<void>(resolve => {
        release = resolve;
      });

      const slow = service.withLock('room-a', 5_000, async () => {
        await gate;
        order.push('a');
      });
      await service.withLock('room-b', 5_000, async () => {
        order.push('b');
      });
      release();
      await slow;

      expect(order).toEqual(['b', 'a']);
    });

    it('releases the lock when the body throws', async () => {
      await expect(
        service.withLock('room', 5_000, async () => {
          throw new Error('body died');
        }),
      ).rejects.toThrow('body died');

      await expect(
        service.withLock('room', 5_000, async () => 'again'),
      ).resolves.toBe('again');
    });

    it('gives up with a ConflictException when the lock never frees', async () => {
      await store.tryLock('room', 60_000);
      await expect(
        service.withLock('room', 5_000, async () => undefined),
      ).rejects.toThrow(ConflictException);
    }, 15_000);

    it('a lock expiring mid-hold cannot be released onto a new holder', async () => {
      // Holder A's lock expires; holder B takes it; A's release must not
      // evict B - that is what the unlock token is for.
      const tokenA = await store.tryLock('room', 1);
      await new Promise(resolve => setTimeout(resolve, 10));
      const tokenB = await store.tryLock('room', 60_000);
      expect(tokenB).not.toBeNull();

      await store.unlock('room', tokenA!);
      expect(await store.tryLock('room', 60_000)).toBeNull();
    });
  });

  describe('json round-trip', () => {
    it('stores and revives typed values', async () => {
      await service.setJson('match', { hp: { a: 100 }, turn: 'a' });
      expect(await service.getJson('match')).toEqual({
        hp: { a: 100 },
        turn: 'a',
      });
    });

    it('returns null for a missing key, not a parse error', async () => {
      expect(await service.getJson('gone')).toBeNull();
    });

    it('expires values by TTL', async () => {
      jest.useFakeTimers();
      try {
        await service.setJson('match', { alive: true }, 60);
        jest.advanceTimersByTime(61_000);
        expect(await service.getJson('match')).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('deadline schedule', () => {
    it('pops only due members, oldest first, up to the limit', async () => {
      await service.addDeadline('late', 3_000);
      await service.addDeadline('early', 1_000);
      await service.addDeadline('middle', 2_000);
      await service.addDeadline('future', 99_000);

      expect(await service.popDueDeadlines(5_000, 2)).toEqual([
        'early',
        'middle',
      ]);
      expect(await service.popDueDeadlines(5_000, 10)).toEqual(['late']);
      expect(await service.popDueDeadlines(5_000, 10)).toEqual([]);
    });

    it('re-adding a member reschedules instead of duplicating', async () => {
      await service.addDeadline('turn', 1_000);
      await service.addDeadline('turn', 9_000);

      expect(await service.popDueDeadlines(5_000, 10)).toEqual([]);
      expect(await service.popDueDeadlines(10_000, 10)).toEqual(['turn']);
    });

    it('a removed member never fires', async () => {
      await service.addDeadline('turn', 1_000);
      await service.removeDeadline('turn');
      expect(await service.popDueDeadlines(5_000, 10)).toEqual([]);
    });
  });

  describe('deadline member codec', () => {
    it('round-trips every kind', () => {
      for (const kind of [
        'setup',
        'turn',
        'ludo-turn',
        'rps-round',
        'chroma-turn',
        'salvo-turn',
      ] as const) {
        expect(parseDeadlineMember(deadlineMember('room-1', kind, 7))).toEqual({
          roomId: 'room-1',
          kind,
          seq: 7,
          arg: '7',
        });
      }
    });

    it('carries a user id through the abandon member instead of a seq', () => {
      expect(parseDeadlineMember(roomAbandonMember('room-1', 'user-1'))).toEqual({
        roomId: 'room-1',
        kind: 'room-abandon',
        seq: NaN,
        arg: 'user-1',
      });
    });

    it('rejects unknown kinds and truncated members', () => {
      expect(parseDeadlineMember('room-1|not-a-kind|1')).toBeNull();
      expect(parseDeadlineMember('room-1|turn')).toBeNull();
      expect(parseDeadlineMember('')).toBeNull();
    });
  });
});
