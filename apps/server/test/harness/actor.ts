import { io, type Socket } from 'socket.io-client';
import type { JwtSignOptions } from '@nestjs/jwt';

import { UserEntity } from '../../src/db/entities/user.entity';
import type { TestApp } from './app';

export type HttpResponse<T = any> = { status: number; body: T };

export type Actor = {
  label: string;
  userId: string;
  token: string;
  socket: Socket;
  get<T = any>(path: string): Promise<HttpResponse<T>>;
  post<T = any>(path: string, body?: unknown): Promise<HttpResponse<T>>;
  del<T = any>(path: string): Promise<HttpResponse<T>>;
  disconnect(): void;
};

let emailCounter = 0;

/**
 * A signed-in player: user row, JWT, and a live socket.
 *
 * Labels must be unique within a test -  is a unique column.
 *
 * Labels must be unique within a test - `username` is a unique column.
 *
 * Every actor needs its own userId. The gateway disconnects an account's
 * existing sockets when a new one authenticates, so two actors sharing a user
 * would silently kill each other's connection and surface as an unrelated
 * assertion failing further down.
 */
export async function createActor(
  testApp: TestApp,
  label: string,
  tokenOptions?: JwtSignOptions,
): Promise<Actor> {
  const repo = testApp.dataSource.getRepository(UserEntity);
  const user = await repo.save(
    repo.create({
      email: `${label}-${++emailCounter}@e2e.local`,
      username: label,
      referralCode: null,
      referredByUserId: null,
    }),
  );

  const token = await testApp.jwt.signAsync({ sub: user.id }, tokenOptions);
  const socket = await connectSocket(testApp.url, token);

  const request = async (
    method: string,
    path: string,
    body?: unknown,
  ): Promise<HttpResponse> => {
    const response = await fetch(`${testApp.url}/api/v1${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    return {
      status: response.status,
      body: text ? JSON.parse(text) : null,
    };
  };

  return {
    label,
    userId: user.id,
    token,
    socket,
    get: path => request('GET', path),
    post: (path, body) => request('POST', path, body),
    del: path => request('DELETE', path),
    disconnect: () => socket.disconnect(),
  };
}

/** `forceNew` matters: socket.io-client otherwise multiplexes every actor
 *  onto one shared connection to the same origin. */
export function connectSocket(url: string, token: string): Promise<Socket> {
  const socket = io(url, {
    auth: { token },
    transports: ['websocket'],
    forceNew: true,
    reconnection: false,
  });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('Socket did not connect within 4000ms')),
      4_000,
    );
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve(socket);
    });
    socket.once('connect_error', error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
