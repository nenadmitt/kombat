import { useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createStore, useStore } from 'zustand';
import type { PublicUserProfile } from '@gaming-platform/core';

import { apiClient } from '../api/client';

const STORAGE_KEY = 'username-cache.v1';
const PROFILE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

type CachedProfile = PublicUserProfile & { fetchedAt: number };
type CacheState = { profiles: Record<string, CachedProfile> };

export class UsernameCacheService {
  readonly store = createStore<CacheState>(() => ({ profiles: {} }));

  private hydrated: Promise<void> | null = null;
  private inFlight = new Set<string>();

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
    } finally {
      missing.forEach(id => this.inFlight.delete(id));
    }
  }

  usernameOf(userId: string): string | null {
    return this.store.getState().profiles[userId]?.username ?? null;
  }

  private hydrate(): Promise<void> {
    if (!this.hydrated) {
      this.hydrated = AsyncStorage.getItem(STORAGE_KEY)
        .then(raw => {
          if (raw) {
            const stored = JSON.parse(raw) as Record<string, CachedProfile>;
            this.store.setState(state => ({
              profiles: { ...stored, ...state.profiles },
            }));
          }
        })
        .catch(() => {
        });
    }
    return this.hydrated;
  }

  private persist(profiles: Record<string, CachedProfile>): void {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(profiles)).catch(() => {
    });
  }
}

export const usernameCache = new UsernameCacheService();

export function useUsernames(
  userIds: string[],
): Record<string, string | null> {
  const profiles = useStore(usernameCache.store, s => s.profiles);

  // Key on the joined ids so a new array with the same content doesn't refetch.
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
