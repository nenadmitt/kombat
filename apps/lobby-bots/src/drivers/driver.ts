import type { ApiClient } from '@gaming-platform/core';
import type { Socket } from 'socket.io-client';

import type { Config } from '../config';
import type { Logger } from '../logger';

export type DriverContext = {
  api: ApiClient;
  socket: Socket;
  roomId: string;
  myUserId: string;
  config: Config;
  log: Logger;
  signal: AbortSignal;
  /** socket.io room membership is server-side, so a reconnected socket must re-join its channels. */
  onReconnect: (redo: () => void) => void;
};

export type DriverResult = { winnerUserId: string | null };

export type GameDriver = (ctx: DriverContext) => Promise<DriverResult>;

export function gameChannel(roomId: string): string {
  return `game:${roomId}`;
}

export function once<T>(
  socket: Socket,
  event: string,
  signal: AbortSignal,
  timeoutMs?: number,
): Promise<T | null> {
  return new Promise(resolve => {
    const timer =
      timeoutMs === undefined ? null : setTimeout(() => finish(null), timeoutMs);
    const onEvent = (payload: T): void => finish(payload);
    const onAbort = (): void => finish(null);
    function finish(value: T | null): void {
      if (timer) clearTimeout(timer);
      socket.off(event, onEvent);
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    }
    socket.on(event, onEvent);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}
