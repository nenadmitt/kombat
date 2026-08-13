import type { BotRuntime } from '../bot/bot-runtime';
import { jitter } from '../bot/pacing';
import type { Config } from '../config';
import type { Logger } from '../logger';

/**
 * A match with no real player in it decides nothing, so playing it out just
 * burns turn clocks and API calls for twenty minutes. Every bot but one
 * concedes and the survivor takes it.
 *
 * A room only counts as all-ours when every seat is a bot this process runs,
 * so a human in the room - even one who joined late - always gets a real match.
 */
export class ConcedePolicy {
  private decided = new Map<string, string>();

  constructor(
    private readonly bots: BotRuntime[],
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  /** Same answer in every bot, and unpredictable across rooms. */
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
      const room = seats[0]!.room!;
      if (seats.length < room.playerCount) continue;
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

  /** Staggered, so a match does not end in the same instant it began. */
  private async concede(bot: BotRuntime, roomId: string): Promise<void> {
    await new Promise(resolve =>
      setTimeout(resolve, jitter(this.config.concedeDelayMs)),
    );
    if (bot.room?.id !== roomId) return;
    try {
      await bot.api.forfeitGameRoom(roomId);
    } catch {
      // Already over - someone else's concession ended it first.
    }
  }
}
