import {
  GameRoomStatus,
  GameType,
  type ApiClient,
  type BotAccount,
  type GameRoomSummary,
} from '@gaming-platform/core';
import type { Socket } from 'socket.io-client';

import { loginBot } from '../auth/login';
import type { Config } from '../config';
import { playBattleship } from '../drivers/battleship.driver';
import { playLudo } from '../drivers/ludo.driver';
import { playRps } from '../drivers/rps.driver';
import { playSalvo } from '../drivers/salvo.driver';
import { gameChannel, type GameDriver } from '../drivers/driver';
import { createLogger, type Logger } from '../logger';
import { connect, leaveChannel, waitForConnect } from '../net/socket';

export type BotState = 'idle' | 'hosting' | 'joining' | 'playing';

const DRIVERS: Partial<Record<GameType, GameDriver>> = {
  [GameType.NavalBattle]: playBattleship,
  [GameType.Ludo]: playLudo,
  [GameType.TripleCut]: playRps,
  [GameType.Salvo]: playSalvo,
};

export function hasDriver(gameType: GameType): boolean {
  return DRIVERS[gameType] !== undefined;
}

export class BotRuntime {
  state: BotState = 'idle';
  room: GameRoomSummary | null = null;
  hostedUntil = 0;

  readonly log: Logger;
  private reconnectHook: (() => void) | null = null;
  api!: ApiClient;
  socket!: Socket;
  userId!: string;

  constructor(
    readonly account: BotAccount,
    private readonly config: Config,
  ) {
    this.log = createLogger(account.username);
  }

  async start(): Promise<void> {
    const session = await loginBot(this.config, this.account.username);
    // Login creates missing accounts, so a username mismatch means the roster was never seeded.
    if (session.username !== this.account.username) {
      throw new Error(
        `${this.account.username} is not seeded (signed in as ${session.username ?? 'a nameless account'}). Run POST /admin/bots/seed first.`,
      );
    }
    this.api = session.api;
    this.userId = session.userId;
    this.socket = connect(this.config.serverUrl, session.accessToken);
    await waitForConnect(this.socket);
    this.socket.on('connect', () => {
      if (!this.reconnectHook) return;
      this.log.info('reconnected, re-entering');
      this.reconnectHook();
    });
    this.log.info('online');
    await this.recover();
  }

  // An InProgress room needs its driver reattached after a restart, or the match hangs until the turn clock ends it.
  private async recover(): Promise<void> {
    const active = await this.api.getMyActiveGameRoom();
    if (!active) return;
    if (active.status === GameRoomStatus.InProgress) {
      this.log.info(`recovering live match ${active.id}`);
      void this.play(active);
      return;
    }
    if (active.creatorUserId === this.userId) {
      this.room = active;
      this.state = 'hosting';
      this.hostedUntil = Date.now() + this.config.hostedRoomTtlMs.min;
      this.log.info(`adopted hosted room ${active.id}`);
    } else {
      this.room = active;
      this.state = 'joining';
    }
  }

  async play(room: GameRoomSummary): Promise<void> {
    const driver = DRIVERS[room.gameType];
    if (!driver) {
      this.log.error(`no driver for game type ${room.gameType}`);
      this.reset();
      return;
    }
    this.state = 'playing';
    this.room = room;
    const controller = new AbortController();
    try {
      this.log.info(`playing ${GameType[room.gameType]} ${room.id}`);
      const result = await driver({
        api: this.api,
        socket: this.socket,
        roomId: room.id,
        myUserId: this.userId,
        config: this.config,
        log: this.log,
        signal: controller.signal,
        onReconnect: redo => {
          this.reconnectHook = redo;
        },
      });
      this.log.info(
        result.winnerUserId === this.userId
          ? `won ${room.id}`
          : `finished ${room.id}`,
      );
    } catch (error) {
      this.log.error(`match ${room.id} failed`, error);
    } finally {
      controller.abort();
      this.reconnectHook = null;
      leaveChannel(this.socket, gameChannel(room.id));
      this.reset();
    }
  }

  reset(): void {
    this.state = 'idle';
    this.room = null;
    this.hostedUntil = 0;
  }

  get isIdle(): boolean {
    return this.state === 'idle';
  }

  async shutdown(): Promise<void> {
    try {
      if (this.state === 'hosting' && this.room) {
        await this.api.closeGameRoom(this.room.id).catch(() => undefined);
      } else if (this.state === 'joining' && this.room) {
        await this.api.leaveGameRoom(this.room.id).catch(() => undefined);
      } else if (this.state === 'playing' && this.room) {
        await this.api.forfeitGameRoom(this.room.id).catch(() => undefined);
      }
    } finally {
      this.socket?.disconnect();
    }
  }
}
