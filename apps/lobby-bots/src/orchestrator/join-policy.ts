import { ApiError, GameRoomStatus, type GameRoomSummary } from '@gaming-platform/core';

import { hasDriver, type BotRuntime } from '../bot/bot-runtime';
import { jitter } from '../bot/pacing';
import type { Config } from '../config';
import type { Logger } from '../logger';
import { canAffordRoom, joinTokenFor } from '../stakes/staking';
import type { LobbyModel } from './lobby-model';

// One delay per room is kept, so a re-rolled shorter delay cannot make a room joinable early.
export class JoinPolicy {
  private delays = new Map<string, number>();
  private claimed = new Set<string>();
  private blacklisted = new Set<string>();

  constructor(
    private readonly lobby: LobbyModel,
    private readonly bots: BotRuntime[],
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  private delayFor(roomId: string): number {
    let delay = this.delays.get(roomId);
    if (delay === undefined) {
      delay = jitter(this.config.joinDelayMs);
      this.delays.set(roomId, delay);
    }
    return delay;
  }

  async tick(): Promise<void> {
    await this.lobby.classifyHosts();
    const candidates = this.lobby
      .humanRooms()
      .filter(({ room }) => !this.claimed.has(room.id))
      // One seat per room here; further seats belong to the fill policy's slow schedule.
      .filter(({ room }) => !this.bots.some(bot => bot.room?.id === room.id))
      .filter(({ room }) => !this.blacklisted.has(room.id))
      .filter(({ room }) => hasDriver(room.gameType))
      .filter(({ room, ageMs }) => ageMs >= this.delayFor(room.id));

    for (const { room } of candidates) {
      const bot = this.bots.find(candidate => candidate.isIdle);
      if (!bot) return;
      await this.join(bot, room);
    }
  }

  private async join(bot: BotRuntime, room: GameRoomSummary): Promise<void> {
    this.claimed.add(room.id);
    bot.state = 'joining';
    try {
      if (!(await canAffordRoom(bot.api, this.config, room))) {
        this.blacklisted.add(room.id);
        bot.reset();
        return;
      }
      const joined = await bot.api.joinGameRoom(room.id, joinTokenFor(room));
      this.log.info(`${bot.account.username} joined ${room.id}`);
      if (joined.status === GameRoomStatus.InProgress) {
        void bot.play(joined);
      } else {
        bot.room = joined;
      }
    } catch (error) {
      // 409 means someone else took the seat between the lobby view and here.
      if (error instanceof ApiError && error.status === 409) {
        this.blacklisted.add(room.id);
      } else {
        this.log.error(`${bot.account.username} could not join ${room.id}`, error);
      }
      bot.reset();
    } finally {
      this.claimed.delete(room.id);
    }
  }

  forget(roomId: string): void {
    this.delays.delete(roomId);
    this.blacklisted.delete(roomId);
  }
}
