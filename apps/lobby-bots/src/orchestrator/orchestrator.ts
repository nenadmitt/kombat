import {
  LOBBY_CHANNEL,
  ROOM_EVENTS,
  type GameRoomSummary,
} from '@gaming-platform/core';

import { BotRuntime } from '../bot/bot-runtime';
import type { Config } from '../config';
import { createLogger } from '../logger';
import { joinChannel } from '../net/socket';
import { CreatePolicy } from './create-policy';
import { JoinPolicy } from './join-policy';
import { LobbyModel } from './lobby-model';
import type { BotRecord } from '../state/bot-store';

const JOIN_TICK_MS = 2_000;
const CREATE_TICK_MS = 5_000;
const RECONCILE_MS = 20_000;
const HEARTBEAT_MS = 60_000;

export class Orchestrator {
  private readonly log = createLogger('orchestrator');
  private readonly bots: BotRuntime[];
  private lobby!: LobbyModel;
  private joinPolicy!: JoinPolicy;
  private createPolicy!: CreatePolicy;
  private timers: NodeJS.Timeout[] = [];
  private stopping = false;

  constructor(
    records: BotRecord[],
    private readonly config: Config,
  ) {
    this.bots = records.map(record => new BotRuntime(record, config));
  }

  async start(): Promise<void> {
    for (const bot of this.bots) {
      await bot.start();
      this.wireRoomEvents(bot);
    }

    const ownIds = new Set(this.bots.map(bot => bot.userId));
    this.lobby = new LobbyModel(this.bots[0]!.api, ownIds);
    // One socket carries the lobby feed; the rest stay quiet until they play.
    const feed = this.bots[0]!.socket;
    this.lobby.attach(feed);
    joinChannel(feed, LOBBY_CHANNEL);
    await this.lobby.reconcile();

    this.joinPolicy = new JoinPolicy(this.lobby, this.bots, this.config, this.log);
    this.createPolicy = new CreatePolicy(
      this.lobby,
      this.bots,
      this.config,
      this.log,
    );

    this.every(JOIN_TICK_MS, () => this.joinPolicy.tick());
    this.every(CREATE_TICK_MS, () => this.createPolicy.tick());
    this.every(RECONCILE_MS, () => this.lobby.reconcile());
    this.every(HEARTBEAT_MS, async () => this.heartbeat());

    this.log.info(`${this.bots.length} bots running`);
  }

  /** A bot's own room lifecycle: when its match starts, it plays. */
  private wireRoomEvents(bot: BotRuntime): void {
    const enter = async (roomId: string): Promise<void> => {
      if (bot.state === 'playing') return;
      const room =
        bot.room?.id === roomId
          ? bot.room
          : await bot.api.getMyActiveGameRoom().catch(() => null);
      if (!room || room.id !== roomId) return;
      void bot.play(room);
    };

    bot.socket.on(ROOM_EVENTS.opponentJoined, (p: { roomId: string }) =>
      void enter(p.roomId),
    );
    bot.socket.on(ROOM_EVENTS.started, (p: { roomId: string }) =>
      void enter(p.roomId),
    );
    // A seat filled in a room this bot hosts, but it is not full yet.
    bot.socket.on(ROOM_EVENTS.playerJoined, (p: { roomId: string }) => {
      if (bot.room?.id === p.roomId) bot.hostedUntil = Date.now() + 60_000;
    });
  }

  private every(ms: number, task: () => Promise<unknown>): void {
    const timer = setInterval(() => {
      if (this.stopping) return;
      void task().catch(error => this.log.error('tick failed', error));
    }, ms);
    this.timers.push(timer);
  }

  private heartbeat(): void {
    const open = this.lobby.openRooms();
    const bot = this.lobby.botHostedRooms().length;
    const playing = this.bots.filter(b => b.state === 'playing').length;
    this.log.info(
      `lobby ${open.length} open (${bot} ours, ${open.length - bot} human) | ${playing} playing | ${this.bots.filter(b => b.isIdle).length} idle`,
    );
  }

  async stop(): Promise<void> {
    this.stopping = true;
    for (const timer of this.timers) clearInterval(timer);
    await Promise.all(this.bots.map(bot => bot.shutdown()));
    this.log.info('stopped');
  }

  /** Exposed for the smoke test. */
  get roster(): { username: string; state: string; room: GameRoomSummary | null }[] {
    return this.bots.map(bot => ({
      username: bot.record.username,
      state: bot.state,
      room: bot.room,
    }));
  }
}
