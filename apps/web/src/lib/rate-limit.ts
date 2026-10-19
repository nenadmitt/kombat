const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MAX_PER_MINUTE = 5;
export const MAX_SIGNUPS_PER_DAY = 5;

type Window = { count: number; resetAt: number };

// Per-instance and lost on redeploy: a speed bump. The unique index on email is the real guard.
const globalForHits = globalThis as typeof globalThis & {
  kombatRateHits?: Map<string, Window>;
};

function hits(): Map<string, Window> {
  if (!globalForHits.kombatRateHits) {
    globalForHits.kombatRateHits = new Map();
  }
  return globalForHits.kombatRateHits;
}

function sweep(now: number): Map<string, Window> {
  const map = hits();
  for (const [key, window] of map) {
    if (window.resetAt <= now) map.delete(key);
  }
  return map;
}

export function tooManyRequests(key: string): boolean {
  const now = Date.now();
  const map = sweep(now);
  const existing = map.get(`m:${key}`);
  if (!existing || existing.resetAt <= now) {
    map.set(`m:${key}`, { count: 1, resetAt: now + MINUTE_MS });
    return false;
  }
  existing.count += 1;
  return existing.count > MAX_PER_MINUTE;
}

export function signupsToday(key: string): number {
  const now = Date.now();
  const existing = sweep(now).get(`d:${key}`);
  return !existing || existing.resetAt <= now ? 0 : existing.count;
}

// Called only after a row is written, so a duplicate or typo never spends the allowance.
export function recordSignup(key: string): void {
  const now = Date.now();
  const map = sweep(now);
  const existing = map.get(`d:${key}`);
  if (!existing || existing.resetAt <= now) {
    map.set(`d:${key}`, { count: 1, resetAt: now + DAY_MS });
    return;
  }
  existing.count += 1;
}
