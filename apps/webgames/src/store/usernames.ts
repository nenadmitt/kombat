import type { PublicUserProfile } from '@gaming-platform/core';
import { useEffect } from 'react';
import { create } from 'zustand';

import { apiClient } from '../lib/api';

type State = { profiles: Record<string, PublicUserProfile> };

const useStore = create<State>(() => ({ profiles: {} }));

const inFlight = new Set<string>();

async function ensure(ids: string[]): Promise<void> {
  const { profiles } = useStore.getState();
  const missing = [...new Set(ids)].filter(
    id => id && !profiles[id] && !inFlight.has(id),
  );
  if (missing.length === 0) return;

  missing.forEach(id => inFlight.add(id));
  try {
    const fetched = await apiClient.getUserProfiles(missing);
    useStore.setState(state => ({
      profiles: {
        ...state.profiles,
        ...Object.fromEntries(fetched.map(p => [p.id, p])),
      },
    }));
  } catch {
  } finally {
    missing.forEach(id => inFlight.delete(id));
  }
}

// Usernames effectively never change, so resolved ones are reused for the session.
export function useUsernames(ids: string[]): Record<string, string | null> {
  const profiles = useStore(s => s.profiles);
  const key = ids.filter(Boolean).sort().join(',');

  useEffect(() => {
    if (key) void ensure(key.split(','));
  }, [key]);

  return Object.fromEntries(
    ids.filter(Boolean).map(id => [id, profiles[id]?.username ?? null]),
  );
}
