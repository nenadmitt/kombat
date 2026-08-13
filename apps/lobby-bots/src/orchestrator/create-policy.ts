import { GameType } from '@gaming-platform/core';

import type { BotRuntime } from '../bot/bot-runtime';
import { jitter } from '../bot/pacing';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { LobbyModel } from './lobby-model';

/** Keeps the lobby from looking dead: at least BOTS_MIN_OPEN_ROOMS stay open. */
export class CreatePolicy {
  constructor(
    private readonly lobby: LobbyModel,
    private readonly bots: BotRuntime[],
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  private pickGameType(): GameType {
    const total = this.config.gameMix.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * total;
    for (const entry of this.config.gameMix) {
      roll -= entry.weight;
      if (roll <= 0) return entry.gameType;
    }
    return this.config.gameMix[0]!.gameType;
  }

  async tick(): Promise<void> {
    await this.closeStaleRooms();

    const open = this.lobby.openRooms().length;
    const hosted = this.bots.filter(bot => bot.state === 'hosting').length;
    if (open >= this.config.minOpenRooms) return;
    if (hosted >= this.config.maxHostedRooms) return;

    const bot = this.bots.find(candidate => candidate.isIdle);
    if (!bot) return;

    const gameType = this.pickGameType();
    bot.state = 'hosting';
    try {
      // Bot-hosted rooms are always free: a bot should never put treasury at
      // risk on its own initiative, only match a stake a player chose.
      const room = await bot.api.createGameRoom(gameType);
      bot.room = room;
      bot.hostedUntil = Date.now() + jitter(this.config.hostedRoomTtlMs);
      this.log.info(
        `${bot.record.username} hosting ${GameType[gameType]} ${room.id} (${open + 1}/${this.config.minOpenRooms} open)`,
      );
    } catch (error) {
      this.log.error(`${bot.record.username} could not create a room`, error);
      bot.reset();
    }
  }

  /** A room nobody joined is noise after a while; close it and free the bot. */
  private async closeStaleRooms(): Promise<void> {
    const now = Date.now();
    for (const bot of this.bots) {
      if (bot.state !== 'hosting' || !bot.room) continue;
      if (bot.hostedUntil > now) continue;
      try {
        await bot.api.closeGameRoom(bot.room.id);
        this.log.info(`${bot.record.username} closed idle room ${bot.room.id}`);
      } catch {
        // Already gone (joined, started, or reaped) - the room events decide
        // what happens next either way.
      }
      bot.reset();
    }
  }
}
