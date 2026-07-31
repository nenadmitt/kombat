const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

type Window = { count: number; resetAt: number };

// Per-instance and lost on redeploy - a speed bump, not a guarantee. The unique
// index on email is what actually keeps the table clean.
const globalForHits = globalThis as typeof globalThis & {
  kombatRateHits?: Map<string, Window>;
};

function hits(): Map<string, Window> {
  if (!globalForHits.kombatRateHits) {
    globalForHits.kombatRateHits = new Map();
  }
  return globalForHits.kombatRateHits;
}

export function tooManyRequests(key: string): boolean {
  const now = Date.now();
  const map = hits();

  for (const [k, window] of map) {
    if (window.resetAt <= now) map.delete(k);
  }

  const existing = map.get(key);
  if (!existing || existing.resetAt <= now) {
    map.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > MAX_PER_WINDOW;
}
