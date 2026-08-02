import { useCallback, useEffect, useRef, useState } from 'react';

/** Gap the manual refresh controls enforce between two hits of the server. */
export const REFRESH_COOLDOWN_MS = 30_000;

type Cooldown = {
  /** Runs the action, then blocks further runs until the gap has passed. */
  run: () => void;
  /** False while the action is blocked - drive the control's disabled state. */
  ready: boolean;
  /** Whole seconds left, for a "wait 12s" label. 0 once ready. */
  secondsLeft: number;
};

/**
 * Rate-limits a user-triggered action. The first press fires immediately;
 * presses inside the window are dropped rather than queued, so holding the
 * button cannot batch up a burst of requests when it opens.
 */
export function useCooldown(
  action: () => void,
  cooldownMs = REFRESH_COOLDOWN_MS,
): Cooldown {
  const [readyAt, setReadyAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const actionRef = useRef(action);
  actionRef.current = action;

  useEffect(() => {
    if (readyAt <= now) {
      return;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [readyAt, now]);

  const ready = now >= readyAt;

  const run = useCallback(() => {
    if (Date.now() < readyAt) {
      return;
    }
    actionRef.current();
    setNow(Date.now());
    setReadyAt(Date.now() + cooldownMs);
  }, [cooldownMs, readyAt]);

  return { run, ready, secondsLeft: ready ? 0 : Math.ceil((readyAt - now) / 1000) };
}
