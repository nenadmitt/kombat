import type { Socket } from 'socket.io-client';

const DEFAULT_TIMEOUT_MS = 4_000;

// Attaches the listener synchronously: call it before the action that triggers the event.
export function waitFor<T = unknown>(
  socket: Socket,
  event: string,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const onEvent = (payload: T): void => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(payload);
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error(`Timed out after ${timeoutMs}ms waiting for "${event}"`));
    }, timeoutMs);
    socket.on(event, onEvent);
  });
}

// `where` skips other seats' events, which can still be in flight when the next action goes out.
export function waitForOrError<T = unknown>(
  socket: Socket,
  event: string,
  errorEvent: string,
  options: { where?: (payload: T) => boolean; timeoutMs?: number } = {},
): Promise<T> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return new Promise<T>((resolve, reject) => {
    const settle = (finish: () => void): void => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      socket.off(errorEvent, onError);
      finish();
    };
    const onEvent = (payload: T): void => {
      if (options.where && !options.where(payload)) {
        return;
      }
      settle(() => resolve(payload));
    };
    const onError = (payload: { message?: string }): void =>
      settle(() =>
        reject(new Error(`"${event}" refused: ${payload?.message ?? ''}`)),
      );
    const timer = setTimeout(
      () =>
        settle(() =>
          reject(
            new Error(`Timed out after ${timeoutMs}ms waiting for "${event}"`),
          ),
        ),
      timeoutMs,
    );
    socket.on(event, onEvent);
    socket.on(errorEvent, onError);
  });
}

export function expectNoEvent(
  socket: Socket,
  event: string,
  withinMs = 500,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onEvent = (payload: unknown): void => {
      clearTimeout(timer);
      socket.off(event, onEvent);
      reject(
        new Error(
          `Expected no "${event}" but received ${JSON.stringify(payload)}`,
        ),
      );
    };
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      resolve();
    }, withinMs);
    socket.on(event, onEvent);
  });
}

// `channel:join` is fire-and-forget with no ack, so a fixed settle window is the only option.
export async function subscribe(
  socket: Socket,
  channel: string,
  settleMs = 150,
): Promise<void> {
  socket.emit('channel:join', { channel });
  await new Promise(resolve => setTimeout(resolve, settleMs));
}

// The gateway broadcasts the winning shot before persisting the room, so DB assertions must wait.
export async function waitUntil<T>(
  check: () => Promise<T | null | undefined | false>,
  timeoutMs = 4_000,
  intervalMs = 50,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const result = await check();
    if (result) {
      return result;
    }
    if (Date.now() > deadline) {
      throw new Error(`Condition not met within ${timeoutMs}ms`);
    }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}

export function collect<T = unknown>(
  socket: Socket,
  event: string,
): { drain(): T[]; stop(): void } {
  const received: T[] = [];
  const onEvent = (payload: T): void => {
    received.push(payload);
  };
  socket.on(event, onEvent);
  return {
    drain: () => [...received],
    stop: () => {
      socket.off(event, onEvent);
    },
  };
}
