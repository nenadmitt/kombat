import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';

import { env } from '../lib/env';
import { sessionStorage } from '../lib/session-storage';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected';

type WebsocketState = {
  status: ConnectionStatus;
  /** Set when the server closed the socket and will not retry on its own. */
  kicked: boolean;
  connect: () => void;
  disconnect: () => void;
  reconnect: () => void;
  joinChannel: (channel: string) => void;
  leaveChannel: (channel: string) => void;
  emit: (event: string, payload?: unknown) => void;
  on: (event: string, handler: (payload: unknown) => void) => () => void;
};

let socket: Socket | null = null;

// socket.io room membership lives in the server's memory, so any reconnect
// drops every subscription. The connect handler replays these.
const joinedChannels = new Set<string>();

export const useWebsocketStore = create<WebsocketState>((set, get) => ({
  status: 'disconnected',
  kicked: false,

  connect: () => {
    if (socket || !sessionStorage.read()?.accessToken) return;

    set({ status: 'connecting', kicked: false });
    const client = io(env.apiBaseUrl, {
      // Callback form: re-read on every attempt, so a reconnect after a
      // refresh carries the new token rather than the one captured here.
      auth: cb => cb({ token: sessionStorage.read()?.accessToken }),
      transports: ['websocket'],
    });

    client.on('connect', () => {
      for (const channel of joinedChannels) {
        client.emit('channel:join', { channel });
      }
      set({ status: 'connected', kicked: false });
    });
    client.on('disconnect', reason => {
      // socket.io does not retry a server-side disconnect, so this one is
      // terminal until something re-opens the connection.
      set({
        status: 'disconnected',
        kicked: reason === 'io server disconnect',
      });
    });
    client.on('connect_error', () => set({ status: 'disconnected' }));

    socket = client;
  },

  disconnect: () => {
    socket?.disconnect();
    socket = null;
    joinedChannels.clear();
    set({ status: 'disconnected', kicked: false });
  },

  reconnect: () => {
    socket?.disconnect();
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
