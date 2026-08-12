import type { Socket } from 'socket.io-client';

const DEFAULT_TIMEOUT_MS = 4_000;

/**
 * Attaches the listener synchronously and returns the promise, so the call
 * must be made *before* the action that triggers the event:
 *
 *   const joined = waitFor(creator.socket, ROOM_EVENTS.opponentJoined);
 *   await joiner.post(`/games/rooms/${roomId}/join`);
 *   expect(await joined).toMatchObject({ roomId });
 *
 * Awaiting the action first is a race that passes locally and fails in CI.
 */
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

/**
 * Resolves on `event`, rejects if `errorEvent` lands first. A gateway that
 * refuses an action answers on its error channel and nothing else, so without
 * this a refusal surfaces as a timeout that names neither the action nor the
 * reason.
 *
 * `where` skips events this caller is not waiting for. A broadcast reaches
 * every seat's socket at its own pace, so one seat's socket can still be
 * holding another seat's event when the next action goes out - taking that as
 * the answer makes the test run one action ahead of the server.
 */
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

/** Fails if the event arrives within the window. Use sparingly — it always
 *  costs its full duration. */
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

/**
 * `channel:join` is fire-and-forget - the server neither acks it nor reports a
 * refusal, so there is nothing to await (see SERVER.BAI.md 2026-08-01). The
 * fixed settle window is the workaround; when that handler learns to ack, this
 * is the one place that changes.
 */
export async function subscribe(
  socket: Socket,
  channel: string,
  settleMs = 150,
): Promise<void> {
  socket.emit('channel:join', { channel });
  await new Promise(resolve => setTimeout(resolve, settleMs));
}

/**
 * Polls until `check` returns truthy. The gateway broadcasts the winning shot
 * before it persists the completed room, so anything asserting on the database
 * has to wait for that tail rather than read straight after the event.
 */
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

/** Buffers every occurrence from the moment it is called. */
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
