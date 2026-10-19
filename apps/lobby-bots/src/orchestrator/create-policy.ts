import { GameType } from '@gaming-platform/core';

import type { BotRuntime } from '../bot/bot-runtime';
import { jitter } from '../bot/pacing';
import type { Config } from '../config';
import type { Logger } from '../logger';
import type { LobbyModel } from './lobby-model';

export class CreatePolicy {
  constructor(
    private readonly lobby: LobbyModel,
    private readonly bots: BotRuntime[],
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  // Only types under the per-game cap, or a heavily weighted game takes every slot.
  private pickGameType(): GameType | null {
    const open = this.lobby.openRoomsByGame();
    const eligible = this.config.gameMix.filter(
      entry => (open.get(entry.gameType) ?? 0) < this.config.maxRoomsPerGame,
    );
    if (eligible.length === 0) return null;

    const total = eligible.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * total;
    for (const entry of eligible) {
      roll -= entry.weight;
      if (roll <= 0) return entry.gameType;
    }
    return eligible[0]!.gameType;
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
    if (gameType === null) return;
    bot.state = 'hosting';
    try {
      // Bots never put treasury at risk on their own initiative, only match a player's stake.
      const room = await bot.api.createGameRoom(gameType);
      bot.room = room;
      bot.hostedUntil = Date.now() + jitter(this.config.hostedRoomTtlMs);
      this.log.info(
        `${bot.account.username} hosting ${GameType[gameType]} ${room.id} (${open + 1}/${this.config.minOpenRooms} open)`,
      );
    } catch (error) {
      this.log.error(`${bot.account.username} could not create a room`, error);
      bot.reset();
    }
  }

  private async closeStaleRooms(): Promise<void> {
    const now = Date.now();
    for (const bot of this.bots) {
      if (bot.state !== 'hosting' || !bot.room) continue;
      if (bot.hostedUntil > now) continue;
      try {
        await bot.api.closeGameRoom(bot.room.id);
        this.log.info(`${bot.account.username} closed idle room ${bot.room.id}`);
      } catch {
        // Already gone; the room events decide what happens next.
      }
      bot.reset();
    }
  }
}
