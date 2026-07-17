import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { BATTLESHIP_EVENTS, LUDO_EVENTS } from '@gaming-platform/core';

import { CacheService, parseDeadlineMember } from '../cache';
import { gameChannel } from '../websockets/rooms.util';
import { WebsocketsService } from '../websockets';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { LudoMatchService } from './ludo/ludo-match.service';
import { StakesService } from './stakes/stakes.service';

const SWEEP_INTERVAL_MS = 1_000;
const SWEEP_BATCH_LIMIT = 50;

/**
 * Polls the shared deadline schedule and enforces expired windows for every
 * turn-based game - the member's kind routes it to the right enforcer
 * (battleship setup/turn, ludo turn; a new game adds a kind + a case here).
 * Enforcement survives restarts and works from any instance:
 *
 * - popDueDeadlines is atomic, so exactly one instance receives a given
 *   member even when every instance sweeps.
 * - Each match service re-validates under its room lock (phase, turnSeq)
 *   before acting, so stale members - e.g. a turn deadline for a turn that
 *   already advanced - are dropped silently instead of clearTimeout'd.
 */
@Injectable()
export class GameDeadlineSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameDeadlineSweeper.name);
  private interval?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly cacheService: CacheService,
    private readonly battleshipMatchService: BattleshipMatchService,
    private readonly ludoMatchService: LudoMatchService,
    private readonly websocketsService: WebsocketsService,
    private readonly stakesService: StakesService,
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
    switch (parsed.kind) {
      case 'setup':
        return this.enforceBattleshipSetupTimeout(parsed.roomId);
      case 'turn':
        return this.enforceBattleshipTurnTimeout(parsed.roomId, parsed.seq);
      case 'ludo-turn':
        return this.enforceLudoTurnTimeout(parsed.roomId, parsed.seq);
    }
  }

  // --- battleship ------------------------------------------------------------

  private async enforceBattleshipTurnTimeout(
    roomId: string,
    seq: number,
  ): Promise<void> {
    const payload = await this.battleshipMatchService.timeoutTurn(roomId, seq);
    if (!payload) {
      return; // Stale — the turn advanced or the match ended/expired.
    }
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      BATTLESHIP_EVENTS.turnTimeout,
      payload,
    );
    if (payload.winnerUserId) {
      await this.stakesService.completeMatch(
        roomId,
        payload.winnerUserId,
        'timeout',
      );
    }
  }

  private async enforceBattleshipSetupTimeout(roomId: string): Promise<void> {
    const result = await this.battleshipMatchService.timeoutSetup(roomId);
    if (!result) {
      return; // Stale — setup completed (or the match is gone).
    }
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      BATTLESHIP_EVENTS.ended,
      { winnerUserId: result.winnerUserId, reason: 'setup-timeout' },
    );
    await this.stakesService.completeMatch(
      roomId,
      result.winnerUserId,
      'setup-timeout',
    );
  }

  // --- ludo ------------------------------------------------------------------

  private async enforceLudoTurnTimeout(
    roomId: string,
    seq: number,
  ): Promise<void> {
    const payload = await this.ludoMatchService.timeoutTurn(roomId, seq);
    if (!payload) {
      return; // Stale — the turn advanced or the match ended/expired.
    }
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      LUDO_EVENTS.turnTimeout,
      payload,
    );
    if (payload.winnerUserId) {
      this.websocketsService.sendToChannel(
        gameChannel(roomId),
        LUDO_EVENTS.ended,
        { winnerUserId: payload.winnerUserId, reason: 'timeout' },
      );
      await this.stakesService.completeMatch(
        roomId,
        payload.winnerUserId,
        'timeout',
      );
    }
  }
}
