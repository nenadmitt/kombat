import {
  GameRoomStatus,
  MULTI_SEAT_MIN_PLAYERS,
  type GameRoomSummary,
} from '@gaming-platform/core';

import type { BotRuntime } from '../bot/bot-runtime';
import { jitter } from '../bot/pacing';
import type { Config } from '../config';
import type { Logger } from '../logger';

type Plan = {
  nextSeatAt: number;
  startsEarly: boolean;
  /** Below capacity for early starters, otherwise filling always beats the start timer. */
  targetSeats: number;
  startAt: number | null;
};

// The one place a bot deliberately joins a bot's room, so multi-seat rooms do not look dead.
export class FillPolicy {
  private plans = new Map<string, Plan>();

  constructor(
    private readonly bots: BotRuntime[],
    private readonly config: Config,
    private readonly log: Logger,
  ) {}

  private planFor(room: GameRoomSummary, now: number): Plan {
    let plan = this.plans.get(room.id);
    if (!plan) {
      const startsEarly = Math.random() < this.config.earlyStartChance;
      plan = {
        nextSeatAt: now + jitter(this.config.seatFillFirstMs),
        startsEarly,
        targetSeats: startsEarly
          ? MULTI_SEAT_MIN_PLAYERS +
            Math.floor(
              Math.random() * (room.playerCount - MULTI_SEAT_MIN_PLAYERS),
            )
          : room.playerCount,
        startAt: null,
      };
      this.plans.set(room.id, plan);
    }
    return plan;
  }

  // One anchor per room, host preferred: only a creator may start early, and two anchors would double the fill rate.
  private anchors(): Map<string, { bot: BotRuntime; isHost: boolean }> {
    const anchors = new Map<string, { bot: BotRuntime; isHost: boolean }>();
    for (const bot of this.bots) {
      const room = bot.room;
      if (!room || room.playerCount <= 2) continue;
      if (bot.state !== 'hosting' && bot.state !== 'joining') continue;
      const isHost = bot.state === 'hosting';
      const existing = anchors.get(room.id);
      if (!existing || (isHost && !existing.isHost)) {
        anchors.set(room.id, { bot, isHost });
      }
    }
    return anchors;
  }

  async tick(): Promise<void> {
    const now = Date.now();
    const anchors = this.anchors();

    for (const roomId of [...this.plans.keys()]) {
      if (!anchors.has(roomId)) this.plans.delete(roomId);
    }

    for (const [, { bot: host, isHost }] of anchors) {
      const room = host.room!;
      if (room.joinedCount >= room.playerCount) continue;
      const plan = this.planFor(room, now);

      if (isHost && plan.startsEarly && room.joinedCount >= plan.targetSeats) {
        if (plan.startAt === null) {
          plan.startAt = now + jitter(this.config.earlyStartMs);
        } else if (now >= plan.startAt) {
          await this.startEarly(host, room);
          continue;
        }
      }

      if (room.joinedCount >= (isHost ? plan.targetSeats : room.playerCount)) {
        continue;
      }
      if (now >= plan.nextSeatAt) {
        await this.takeSeat(host, room);
        plan.nextSeatAt = now + jitter(this.config.seatFillNextMs);
      }
    }
  }

  private async startEarly(
    host: BotRuntime,
    room: GameRoomSummary,
  ): Promise<void> {
    try {
      await host.api.startGameRoom(room.id);
      this.log.info(
        `${host.account.username} started ${room.id} early at ${room.joinedCount}/${room.playerCount}`,
      );
    } catch {
      // Filled or gone in the meantime; the room events take it from here.
    }
    this.plans.delete(room.id);
  }

  private async takeSeat(
    host: BotRuntime,
    room: GameRoomSummary,
  ): Promise<void> {
    const filler = this.bots.find(bot => bot.isIdle && bot !== host);
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
