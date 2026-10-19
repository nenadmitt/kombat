import { io, type Socket } from 'socket.io-client';

// The gateway drops an account's previous socket, and socket.io multiplexes same-origin connections unless forceNew.
export function connect(serverUrl: string, token: string): Socket {
  return io(serverUrl, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  });
}

export function waitForConnect(socket: Socket, timeoutMs = 10_000): Promise<void> {
  if (socket.connected) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Socket did not connect in time'));
    }, timeoutMs);
    const onConnect = (): void => {
      cleanup();
      resolve();
    };
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    function cleanup(): void {
      clearTimeout(timer);
      socket.off('connect', onConnect);
      socket.off('connect_error', onError);
    }
    socket.on('connect', onConnect);
    socket.on('connect_error', onError);
  });
}

export function joinChannel(socket: Socket, channel: string): void {
  socket.emit('channel:join', { channel });
}

export function leaveChannel(socket: Socket, channel: string): void {
  socket.emit('channel:leave', { channel });
}
