import { GameRoomStatus, type GameRoomSummary } from '@gaming-platform/core';

import type { BotRuntime } from '../bot/bot-runtime';
import { jitter } from '../bot/pacing';
import type { Config } from '../config';
import type { Logger } from '../logger';

/**
 * Once a real player is at a multi-seat table, bots fill the remaining seats
 * one at a time on a slow schedule, so that player is not left waiting at a
 * 2/4 table for someone who never comes.
 *
 * A table with no human in it is never filled. Bots seating bots produced a
 * match nobody played every few minutes - hundreds of "completed" rooms a
 * day - and a bot-hosted room that stays at 1/4 is exactly what it should be
 * until a person sits down. Starting a table is the human host's call, so
 * bots never start one early either.
 */
export class FillPolicy {
  /** roomId -> when the next bot takes a seat. */
  private nextSeatAt = new Map<string, number>();

  constructor(
    private readonly bots: BotRuntime[],
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  /**
   * One bot per human table, to pace it. A bot only ever *joins* a room a
   * human hosts - the join policy never touches a bot's room - so "joining"
   * is the marker for a human table, and a bot that is "hosting" is left
   * alone with its empty room.
   */
  private humanTables(): Map<string, BotRuntime> {
    const tables = new Map<string, BotRuntime>();
    for (const bot of this.bots) {
      const room = bot.room;
      if (!room || room.playerCount <= 2 || bot.state !== 'joining') continue;
      if (!tables.has(room.id)) tables.set(room.id, bot);
    }
    return tables;
  }

  async tick(): Promise<void> {
    const now = Date.now();
    const tables = this.humanTables();

    for (const roomId of [...this.nextSeatAt.keys()]) {
      if (!tables.has(roomId)) this.nextSeatAt.delete(roomId);
    }

    for (const [roomId, seated] of tables) {
      const room = seated.room!;
      if (room.joinedCount >= room.playerCount) continue;

      let due = this.nextSeatAt.get(roomId);
      if (due === undefined) {
        due = now + jitter(this.config.seatFillFirstMs);
        this.nextSeatAt.set(roomId, due);
      }
      if (now < due) continue;

      await this.takeSeat(seated, room);
      this.nextSeatAt.set(roomId, now + jitter(this.config.seatFillNextMs));
    }
  }

  private async takeSeat(
    seated: BotRuntime,
    room: GameRoomSummary,
  ): Promise<void> {
    const filler = this.bots.find(bot => bot.isIdle && bot !== seated);
    if (!filler) return;

    filler.state = 'joining';
    try {
      const joined = await filler.api.joinGameRoom(room.id);
      filler.room = joined;
      this.log.info(
        `${filler.account.username} took a seat in ${room.id} (${joined.joinedCount}/${joined.playerCount})`,
      );
      if (joined.status === GameRoomStatus.InProgress) {
        void filler.play(joined);
      }
    } catch (error) {
      this.log.error(`${filler.account.username} could not take a seat`, error);
      filler.reset();
    }
  }
}
