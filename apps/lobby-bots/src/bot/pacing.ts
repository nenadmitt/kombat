import type { Range } from '../config';

export const DEADLINE_MARGIN_MS = 8_000;

export function jitter(range: Range): number {
  return range.min + Math.random() * (range.max - range.min);
}

export function pauseFor(
  range: Range,
  deadline: number | null,
  now = Date.now(),
): number {
  const wanted = jitter(range);
  if (deadline === null) return wanted;
  const room = deadline - now - DEADLINE_MARGIN_MS;
  if (room <= 0) return 0;
  return Math.min(wanted, room);
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise(resolve => {
    const timer = setTimeout(done, ms);
    function done(): void {
      clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
}
