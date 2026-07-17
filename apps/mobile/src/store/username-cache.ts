import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore, useStore } from 'zustand';
import type { PublicUserProfile } from '@gaming-platform/core';

import { apiClient } from '../api/client';

/**
 * One generic username/avatar resolver for every screen that only knows user
 * ids (match rosters, history, lobbies). Batch-fetches via
 * GET /users/profiles, dedupes in-flight ids, and caches aggressively -
 * usernames effectively never change, so entries live for a week and persist
 * across app restarts.
 *
 * Use the `useUsernames(ids)` hook from components/engines; the
 * `usernameCache` singleton is there for non-React callers.
 */
const STORAGE_KEY = 'username-cache.v1';
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CachedProfile = PublicUserProfile & { fetchedAt: number };
type CacheState = { profiles: Record<string, CachedProfile> };

export class UsernameCacheService {
  /** Vanilla zustand store so both React (useStore) and plain code can read. */
  readonly store = createStore<CacheState>(() => ({ profiles: {} }));

  private hydrated: Promise<void> | null = null;
  private inFlight = new Set<string>();

  /** Resolve any ids not cached (or stale) via one batched request. */
  async ensure(ids: string[]): Promise<void> {
    await this.hydrate();

    const now = Date.now();
    const { profiles } = this.store.getState();
    const missing = [...new Set(ids)].filter(id => {
      const cached = profiles[id];
      return (
        !this.inFlight.has(id) &&
        (!cached || now - cached.fetchedAt > PROFILE_TTL_MS)
      );
    });
    if (missing.length === 0) {
      return;
    }
    missing.forEach(id => this.inFlight.add(id));
    try {
      const fetched = await apiClient.getUserProfiles(missing);
      this.store.setState(state => {
        const next = { ...state.profiles };
        for (const profile of fetched) {
          next[profile.id] = { ...profile, fetchedAt: now };
        }
        this.persist(next);
        return { profiles: next };
      });
    } catch {
      // Offline/transient - callers fall back to placeholder names and the
      // next ensure retries.
    } finally {
      missing.forEach(id => this.inFlight.delete(id));
    }
  }

  /** Cached username for an id, or null while unknown. */
  usernameOf(userId: string): string | null {
    return this.store.getState().profiles[userId]?.username ?? null;
  }

  private hydrate(): Promise<void> {
    if (!this.hydrated) {
      this.hydrated = AsyncStorage.getItem(STORAGE_KEY)
        .then(raw => {
          if (raw) {
            const stored = JSON.parse(raw) as Record<string, CachedProfile>;
            // Anything fetched while hydration was in flight wins.
            this.store.setState(state => ({
              profiles: { ...stored, ...state.profiles },
            }));
          }
        })
        .catch(() => {
          // Corrupt/missing cache - start fresh.
        });
    }
    return this.hydrated;
  }

  private persist(profiles: Record<string, CachedProfile>): void {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)).catch(() => {
      // Cache persistence is best-effort; memory still has the entries.
    });
  }
}

export const usernameCache = new UsernameCacheService();

/**
 * Reactive usernames for a set of user ids: kicks off (batched, deduped)
 * resolution for anything missing and re-renders as results land. Returns
 * id -> username (null while unresolved / user has no username yet).
 */
export function useUsernames(
  userIds: string[],
): Record<string, string | null> {
  const profiles = useStore(usernameCache.store, s => s.profiles);

  // Key on the joined ids so a new array identity with the same content
  // doesn't refetch.
  const idsKey = [...new Set(userIds)].sort().join(',');
  useEffect(() => {
    if (idsKey) {
      void usernameCache.ensure(idsKey.split(','));
    }
  }, [idsKey]);

  const result: Record<string, string | null> = {};
  for (const id of userIds) {
    result[id] = profiles[id]?.username ?? null;
  }
  return result;
}
