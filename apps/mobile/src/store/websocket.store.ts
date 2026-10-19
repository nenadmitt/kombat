import { create } from 'zustand';
import { io, type Socket } from 'socket.io-client';

import { env } from '../config/env';
import { useCurrentUserStore } from './currentUser.store';

type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type WebsocketState = {
  status: ConnectionStatus;

  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;

  joinChannel: (channel: string) => void;
  leaveChannel: (channel: string) => void;

  emit: (event: string, payload?: unknown) => void;
  on: (event: string, handler: (payload: unknown) => void) => () => void;
};

let socket: Socket | null = null;

// Room membership lives in server memory and every reconnect drops it; the `connect` handler replays these.
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
      // Callback form: re-read on every attempt, so a reconnect after a refresh carries the new token.
      auth: cb => cb({ token: useCurrentUserStore.getState().accessToken }),
      transports: ['websocket'],
    });

    client.on('connect', () => {
      // Re-join before flipping status so reconnect-driven effects observe a fully subscribed socket.
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

  // socket.io doesn't retry after a server-side disconnect. Driven from session refresh, not the disconnect:
  // a signed-in-elsewhere kick looks identical, and reconnecting on it would loop two devices.
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
