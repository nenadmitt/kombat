import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import {
  BATTLESHIP_EVENTS,
  CHROMA_EVENTS,
  SALVO_EVENTS,
  LUDO_EVENTS,
  RPS_EVENTS,
} from '@gaming-platform/core';

import { CacheService, parseDeadlineMember } from '../cache';
import { DbService } from '../db';
import { gameChannel } from '../websockets/rooms.util';
import { WebsocketsService } from '../websockets';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { ChromaMatchService } from './chroma/chroma-match.service';
import { SalvoMatchService } from './salvo/salvo-match.service';
import { LudoMatchService } from './ludo/ludo-match.service';
import { RoomAbandonService } from './room-abandon.service';
import { RpsMatchService } from './rps/rps-match.service';
import { StakesService } from './stakes/stakes.service';

const SWEEP_INTERVAL_MS = 1_000;
const SWEEP_BATCH_LIMIT = 50;

// Members pop atomically and each enforcer re-validates under its room lock, so stale ones are simply dropped.
@Injectable()
export class GameDeadlineSweeper implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(GameDeadlineSweeper.name);
  private interval?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly cacheService: CacheService,
    private readonly battleshipMatchService: BattleshipMatchService,
    private readonly chromaMatchService: ChromaMatchService,
    private readonly salvoMatchService: SalvoMatchService,
    private readonly ludoMatchService: LudoMatchService,
    private readonly rpsMatchService: RpsMatchService,
    private readonly websocketsService: WebsocketsService,
    private readonly stakesService: StakesService,
    private readonly roomAbandonService: RoomAbandonService,
    private readonly dbService: DbService,
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
    // Skip the tick rather than stack a second sweep on a slow one.
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
      case 'rps-round':
        return this.enforceRpsRoundTimeout(parsed.roomId, parsed.seq);
      case 'chroma-turn':
        return this.enforceChromaTurnTimeout(parsed.roomId, parsed.seq);
      case 'salvo-turn':
        return this.enforceSalvoTurnTimeout(parsed.roomId, parsed.seq);
      case 'room-abandon':
        return this.roomAbandonService.enforce(parsed.roomId, parsed.arg);
    }
  }

  private async enforceBattleshipTurnTimeout(
    roomId: string,
    seq: number,
  ): Promise<void> {
    const payload = await this.battleshipMatchService.timeoutTurn(roomId, seq);
    if (!payload) {
      return;
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
      return;
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

  private async enforceLudoTurnTimeout(
    roomId: string,
    seq: number,
  ): Promise<void> {
    const payload = await this.ludoMatchService.timeoutTurn(roomId, seq);
    if (!payload) {
      return;
    }
    if (payload.eliminatedColor !== null) {
      await this.dbService.recordEliminatedUser(roomId, payload.timedOutUserId);
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

  private async enforceRpsRoundTimeout(
    roomId: string,
    seq: number,
  ): Promise<void> {
    const result = await this.rpsMatchService.timeoutRound(roomId, seq);
    if (!result) {
      return;
    }
    const { reveal, over } = result;
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      RPS_EVENTS.reveal,
      reveal,
    );
    if (over) {
      this.websocketsService.sendToChannel(
        gameChannel(roomId),
        RPS_EVENTS.ended,
        { winnerUserId: reveal.winnerUserId, reason: 'timeout' },
      );
      await this.stakesService.completeMatch(
        roomId,
        reveal.winnerUserId,
        'timeout',
      );
    }
  }

  private async enforceChromaTurnTimeout(
    roomId: string,
    seq: number,
  ): Promise<void> {
    const mutation = await this.chromaMatchService.timeoutTurn(roomId, seq);
    if (!mutation) {
      return;
    }
    const { payload, changedHands } = mutation;
    if (payload.eliminatedUserId) {
      await this.dbService.recordEliminatedUser(
        roomId,
        payload.eliminatedUserId,
      );
    }
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      CHROMA_EVENTS.turnTimeout,
      payload,
    );
    for (const [userId, cards] of Object.entries(changedHands)) {
      this.websocketsService.sendToUser(userId, CHROMA_EVENTS.hand, { cards });
    }
    if (payload.winnerUserId) {
      this.websocketsService.sendToChannel(
        gameChannel(roomId),
        CHROMA_EVENTS.ended,
        { winnerUserId: payload.winnerUserId, reason: 'timeout' },
      );
      await this.stakesService.completeMatch(
        roomId,
        payload.winnerUserId,
        'timeout',
      );
    }
  }

  private async enforceSalvoTurnTimeout(
    roomId: string,
    seq: number,
  ): Promise<void> {
    const payload = await this.salvoMatchService.timeoutTurn(roomId, seq);
    if (!payload) {
      return;
    }
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      SALVO_EVENTS.turnTimeout,
      payload,
    );
    if (payload.winnerUserId) {
      this.websocketsService.sendToChannel(
        gameChannel(roomId),
        SALVO_EVENTS.ended,
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
