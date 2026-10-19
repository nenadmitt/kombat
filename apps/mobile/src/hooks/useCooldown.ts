import { useCallback, useEffect, useRef, useState } from 'react';

export const REFRESH_COOLDOWN_MS = 30_000;

type Cooldown = {
  run: () => void;
  ready: boolean;
  secondsLeft: number;
};

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
