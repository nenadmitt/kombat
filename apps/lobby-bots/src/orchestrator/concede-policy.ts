import type { BotRuntime } from '../bot/bot-runtime';
import { jitter } from '../bot/pacing';
import type { Config } from '../config';
import type { Logger } from '../logger';

// Only rooms where every seat is a bot this process runs; a human in the room always gets a real match.
export class ConcedePolicy {
  private decided = new Map<string, string>();

  constructor(
    private readonly bots: BotRuntime[],
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  /** Deterministic so every bot agrees on the winner. */
  private pickWinner(roomId: string, userIds: string[]): string {
    const seed = [...roomId].reduce((sum, char) => sum + char.charCodeAt(0), 0);
    return [...userIds].sort()[seed % userIds.length]!;
  }

  async tick(): Promise<void> {
    const rooms = new Map<string, BotRuntime[]>();
    for (const bot of this.bots) {
      if (bot.state !== 'playing' || !bot.room) continue;
      const seats = rooms.get(bot.room.id) ?? [];
      seats.push(bot);
      rooms.set(bot.room.id, seats);
    }

    for (const [roomId, seats] of rooms) {
      // Seats taken, not capacity: a room started early has fewer players than seats.
      const taken = Math.max(
        ...seats.map(bot => bot.room!.joinedCount),
        seats.length,
      );
      if (seats.length < taken) continue;
      if (this.decided.has(roomId)) continue;

      const winner = this.pickWinner(
        roomId,
        seats.map(bot => bot.userId),
      );
      this.decided.set(roomId, winner);
      const winnerName =
        seats.find(bot => bot.userId === winner)?.account.username ?? '?';
      this.log.info(
        `${roomId} is all bots - ${winnerName} takes it, ${seats.length - 1} conceding`,
      );

      for (const bot of seats) {
        if (bot.userId === winner) continue;
        void this.concede(bot, roomId);
      }
    }

    for (const roomId of [...this.decided.keys()]) {
      if (!rooms.has(roomId)) this.decided.delete(roomId);
    }
  }

  private async concede(bot: BotRuntime, roomId: string): Promise<void> {
    await new Promise(resolve =>
      setTimeout(resolve, jitter(this.config.concedeDelayMs)),
    );
    if (bot.room?.id !== roomId) return;
    try {
      await bot.api.forfeitGameRoom(roomId);
    } catch {
      // Already over: another concession ended it first.
    }
  }
}
