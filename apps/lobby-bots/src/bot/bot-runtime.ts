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
import { gameChannel, type GameDriver } from '../drivers/driver';
import { createLogger, type Logger } from '../logger';
import { connect, leaveChannel, waitForConnect } from '../net/socket';

export type BotState = 'idle' | 'hosting' | 'joining' | 'playing';

const DRIVERS: Partial<Record<GameType, GameDriver>> = {
  [GameType.NavalBattle]: playBattleship,
  [GameType.Ludo]: playLudo,
};

export function hasDriver(gameType: GameType): boolean {
  return DRIVERS[gameType] !== undefined;
}

export class BotRuntime {
  state: BotState = 'idle';
  /** The room this bot hosts or sits in while it is not yet playing. */
  room: GameRoomSummary | null = null;
  /** When the hosted room should be closed if nobody joins. */
  hostedUntil = 0;

  readonly log: Logger;
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
    // Signing in creates the account if it is missing, so a roster that was
    // never seeded would quietly fill the lobby with nameless, unflagged
    // users. The username is the one thing seeding sets that login cannot.
    if (session.username !== this.account.username) {
      throw new Error(
        `${this.account.username} is not seeded (signed in as ${session.username ?? 'a nameless account'}). Run POST /admin/bots/seed first.`,
      );
    }
    this.api = session.api;
    this.userId = session.userId;
    this.socket = connect(this.config.serverUrl, session.accessToken);
    await waitForConnect(this.socket);
    this.log.info('online');
    await this.recover();
  }

  /**
   * A restart can land mid-anything, and the server is the only witness. A
   * room that is already InProgress needs its driver attached or the match
   * hangs until the turn clock kills it.
   */
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
        // Reads to the opponent as a player walking away, which is the
        // honest thing for a bot being switched off mid-match.
        await this.api.forfeitGameRoom(this.room.id).catch(() => undefined);
      }
    } finally {
      this.socket?.disconnect();
    }
  }
}
