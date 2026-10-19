import { useEffect, useRef } from 'react';

/** The state read fails briefly around kickoff (rejected until the room is InProgress), and nothing else retries while the socket is healthy. */
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
