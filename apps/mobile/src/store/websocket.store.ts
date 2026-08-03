import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';

import { env } from '../config/env';
import { useCurrentUserStore } from './currentUser.store';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

/**
 * One socket.io connection per logged-in user, reused across the app (games
 * etc.) instead of each screen opening its own. Lifecycle is driven by auth
 * state in RootNavigator - connect() once authenticated, disconnect() on
 * logout - so callers just join/leave channels and send/receive on top of
 * whatever connection is already there.
 */
type WebsocketState = {
  status: ConnectionStatus;

  connect: () => void;
  disconnect: () => void;
  /** Re-open with the current token, keeping channel subscriptions. */
  reconnect: () => void;

  /** Joins a channel (server-side room) to start receiving its broadcasts. */
  joinChannel: (channel: string) => void;
  leaveChannel: (channel: string) => void;

  /** Generic send - `event` is whatever the server/game expects. */
  emit: (event: string, payload?: unknown) => void;
  /** Generic subscribe. Returns an unsubscribe function. */
  on: (event: string, handler: (payload: unknown) => void) => () => void;
};

// Not part of the store's reactive state on purpose - nothing needs to
// re-render when the underlying Socket instance itself changes, only when
// `status` does.
let socket: Socket | null = null;

// Channels the app is currently subscribed to. socket.io room membership
// lives in the server's memory, so any reconnect - network blip or a server
// redeploy - silently drops every subscription. The `connect` handler
// replays these so broadcasts resume without each screen having to care.
const joinedChannels = new Set<string>();

export const useWebsocketStore = create<WebsocketState>((set, get) => ({
  status: 'disconnected',

  connect: () => {
    if (socket) {
      return;
    }
    if (!useCurrentUserStore.getState().accessToken) {
      return;
    }

    set({ status: 'connecting' });
    const client = io(env.apiBaseUrl, {
      // Callback form: re-read on every attempt, so a reconnect after a
      // refresh carries the new token instead of the one captured here.
      auth: cb => cb({ token: useCurrentUserStore.getState().accessToken }),
      transports: ['websocket'],
    });

    client.on('connect', () => {
      // Fires on the initial connect AND every auto-reconnect - re-join all
      // channels (idempotent server-side) before flipping the status, so
      // reconnect-driven effects observe a fully subscribed socket.
      for (const channel of joinedChannels) {
        client.emit('channel:join', { channel });
      }
      set({ status: 'connected' });
    });
    client.on('disconnect', () => set({ status: 'disconnected' }));
    client.on('connect_error', () => set({ status: 'disconnected' }));
    client.on('channel:error', payload => {
      const p = payload as { channel?: string; message?: string };
      console.warn(`[ws] channel refused: ${p.channel}: ${p.message}`);
    });

    socket = client;
  },

  disconnect: () => {
    socket?.disconnect();
    socket = null;
    joinedChannels.clear();
    set({ status: 'disconnected' });
  },

  /**
   * The server disconnects a socket whose token it rejects, and socket.io does
   * not retry after a server-side disconnect - so a lapsed token strands the
   * connection until something tears it down and opens a new one.
   *
   * Driven from the session-refresh callback rather than from the disconnect
   * itself: being kicked for a bad token and being kicked by this account
   * signing in elsewhere look identical to the client, and reconnecting on the
   * latter would leave two devices kicking each other in a loop.
   */
  reconnect: () => {
    if (!socket) {
      return;
    }
    socket.disconnect();
    socket = null;
    set({ status: 'disconnected' });
    get().connect();
  },

  joinChannel: channel => {
    joinedChannels.add(channel);
    socket?.emit('channel:join', { channel });
  },

  leaveChannel: channel => {
    joinedChannels.delete(channel);
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
