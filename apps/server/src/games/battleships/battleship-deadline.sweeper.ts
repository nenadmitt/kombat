import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BATTLESHIP_EVENTS } from '@gaming-platform/core';

import { CacheService, parseDeadlineMember } from '../../cache';
import { DbService } from '../../db';
import { gameChannel } from '../../websockets/rooms.util';
import { WebsocketsService } from '../../websockets';
import { BattleshipMatchService } from './battleship-match.service';

const SWEEP_INTERVAL_MS = 1_000;
const SWEEP_BATCH_LIMIT = 50;

/**
 * Polls the shared deadline schedule and enforces expired setup/turn windows.
 * Replaces the gateway's per-room setTimeouts so enforcement survives
 * restarts and works from any instance:
 *
 * - popDueDeadlines is atomic, so exactly one instance receives a given
 *   member even when every instance sweeps.
 * - The match service re-validates under the room lock (phase, turnSeq)
 *   before acting, so stale members — e.g. a turn deadline for a turn that
 *   already advanced — are dropped silently instead of clearTimeout'd.
 */
@Injectable()
export class BattleshipDeadlineSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(BattleshipDeadlineSweeper.name);
  private interval?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly cacheService: CacheService,
    private readonly matchService: BattleshipMatchService,
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
  ) {}

  onModuleInit(): void {
    this.interval = setInterval(() => {
      void this.sweep();
    }, SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
    }
  }

  private async sweep(): Promise<void> {
    // A slow sweep (lock contention, Redis hiccup) must not stack a second
    // one on top — skip the tick instead.
    if (this.sweeping) {
      return;
    }
    this.sweeping = true;
    try {
      const due = await this.cacheService.popDueDeadlines(
        Date.now(),
        SWEEP_BATCH_LIMIT,
      );
      for (const member of due) {
        try {
          await this.enforce(member);
        } catch (error) {
          this.logger.error(
            `Failed to enforce deadline "${member}"`,
            error instanceof Error ? error.stack : String(error),
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Deadline sweep failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.sweeping = false;
    }
  }

  private async enforce(member: string): Promise<void> {
    const parsed = parseDeadlineMember(member);
    if (!parsed) {
      this.logger.warn(`Dropping malformed deadline member "${member}"`);
      return;
    }
    if (parsed.kind === 'setup') {
      await this.enforceSetupTimeout(parsed.roomId);
    } else {
      await this.enforceTurnTimeout(parsed.roomId, parsed.seq);
    }
  }

  private async enforceTurnTimeout(roomId: string, seq: number): Promise<void> {
    const payload = await this.matchService.timeoutTurn(roomId, seq);
    if (!payload) {
      return; // Stale — the turn advanced or the match ended/expired.
    }
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      BATTLESHIP_EVENTS.turnTimeout,
      payload,
    );
    if (payload.winnerUserId) {
      await this.dbService.completeGameRoom(roomId);
    }
  }

  private async enforceSetupTimeout(roomId: string): Promise<void> {
    const result = await this.matchService.timeoutSetup(roomId);
    if (!result) {
      return; // Stale — setup completed (or the match is gone).
    }
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      BATTLESHIP_EVENTS.ended,
      { winnerUserId: result.winnerUserId, reason: 'setup-timeout' },
    );
    await this.dbService.completeGameRoom(roomId);
  }
}
