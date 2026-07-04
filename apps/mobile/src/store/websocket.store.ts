import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';

import { env } from '../config/env';
import { useCurrentUserStore } from './currentUser.store';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * One socket.io connection per logged-in user, reused across the app (games
 * etc.) instead of each screen opening its own. Lifecycle is driven by auth
 * state in RootNavigator — connect() once authenticated, disconnect() on
 * logout — so callers just join/leave channels and send/receive on top of
 * whatever connection is already there.
 */
type WebsocketState = {
  status: ConnectionStatus;

  connect: () => void;
  disconnect: () => void;

  /** Joins a channel (server-side room) to start receiving its broadcasts. */
  joinChannel: (channel: string) => void;
  leaveChannel: (channel: string) => void;

  /** Generic send — `event` is whatever the server/game expects. */
  emit: (event: string, payload?: unknown) => void;
  /** Generic subscribe. Returns an unsubscribe function. */
  on: (event: string, handler: (payload: unknown) => void) => () => void;
};

// Not part of the store's reactive state on purpose — nothing needs to
// re-render when the underlying Socket instance itself changes, only when
// `status` does.
let socket: Socket | null = null;

export const useWebsocketStore = create<WebsocketState>(set => ({
  status: 'disconnected',

  connect: () => {
    if (socket) {
      return;
    }
    const token = useCurrentUserStore.getState().accessToken;
    if (!token) {
      return;
    }

    set({ status: 'connecting' });
    const client = io(env.apiBaseUrl, {
      auth: { token },
      transports: ['websocket'],
    });

    client.on('connect', () => set({ status: 'connected' }));
    client.on('disconnect', () => set({ status: 'disconnected' }));
    client.on('connect_error', () => set({ status: 'disconnected' }));

    socket = client;
  },

  disconnect: () => {
    socket?.disconnect();
    socket = null;
    set({ status: 'disconnected' });
  },

  joinChannel: channel => {
    socket?.emit('channel:join', { channel });
  },

  leaveChannel: channel => {
    socket?.emit('channel:leave', { channel });
  },

  emit: (event, payload) => {
    socket?.emit(event, payload);
  },

  on: (event, handler) => {
    socket?.on(event, handler);
    return () => {
      socket?.off(event, handler);
    };
  },
}));
