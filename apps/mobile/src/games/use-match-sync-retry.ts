import { useEffect, useRef } from 'react';

/**
 * Retry a match's initial state fetch until it lands.
 *
 * Every multiplayer engine loads a snapshot on mount and swallows the error
 * if it fails, on the assumption that "reconnect or remount will retry". But
 * neither happens while the socket stays healthy, so a single failed fetch
 * left the player on the loading spinner for the rest of the match.
 *
 * The fetch legitimately fails for a beat around kickoff: the client
 * navigates the instant the start event arrives, and the server rejects a
 * state read until the room is InProgress. Without Redis the window is far
 * wider, because an invalidation only clears the instance that wrote it and
 * another instance can serve a stale Pending room for up to a minute.
 *
 * So: keep asking, backing off, until `done` goes true.
 */
const RETRY_DELAYS_MS = [400, 800, 1500, 3000, 5000, 8000, 8000, 8000];

export function useMatchSyncRetry(sync: () => Promise<void>, done: boolean) {
  const syncRef = useRef(sync);
  syncRef.current = sync;

  useEffect(() => {
    if (done) {
      return;
    }
    let cancelled = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = () => {
      void syncRef.current().finally(() => {
        if (cancelled) {
          return;
        }
        // `done` flipping tears this effect down; if it has not, the fetch
        // did not land and we go again.
        const delay =
          RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]!;
        attempt += 1;
        timer = setTimeout(tick, delay);
      });
    };

    tick();
    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
    };
  }, [done]);
}
