import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { BATTLESHIP_EVENTS, TURN_SECONDS } from '@gaming-platform/core';

import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { gameChannel } from '../../websockets/rooms.util';
import { WebsocketsService } from '../../websockets';
import { BattleshipMatchService } from './battleship-match.service';
import {
  BattleshipEnterDto,
  BattleshipFireDto,
  BattleshipForfeitDto,
  BattleshipReadyDto,
} from './battleship.dto';

type SocketWithUser = Socket & { data: { userId?: string } };

/**
 * Battleship realtime handlers. This is a second gateway class only for
 * handler organization — it shares the same socket.io server and connections
 * as WebsocketsGateway (which owns connection/auth and populates
 * `client.data.userId`). It never implements handleConnection.
 */
@WebSocketGateway({ cors: true })
export class BattleshipGateway {
  private readonly logger = new Logger(BattleshipGateway.name);
  // Server-authoritative per-room turn clock.
  private readonly turnTimers = new Map<string, ReturnType<typeof setTimeout>>();
  // Per-room fleet-setup clock — a player who never deploys auto-forfeits.
  private readonly setupTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private readonly matchService: BattleshipMatchService,
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
  ) {}

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(BATTLESHIP_EVENTS.enter)
  async handleEnter(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: BattleshipEnterDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      const room = await this.loadParticipantRoom(dto.roomId, userId);
      // The match may not exist yet if this is the first player in; create it
      // so presence can be recorded before either side has submitted a fleet.
      const match = this.matchService.getOrCreate(room);
      if (match.phase === 'setup') {
        this.armSetupTimer(dto.roomId, match.setupDeadline);
        // Push the countdown to this player directly — the REST snapshot may
        // have been fetched before the match (and its deadline) existed.
        client.emit(BATTLESHIP_EVENTS.setupState, {
          setupDeadline: match.setupDeadline,
        });
      }
      this.markOnline(client, dto.roomId, userId);
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(BATTLESHIP_EVENTS.ready)
  async handleReady(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: BattleshipReadyDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      const room = await this.loadParticipantRoom(dto.roomId, userId);
      const match = this.matchService.getOrCreate(room);
      const result = this.matchService.setFleet(dto.roomId, userId, dto.placements);
      this.markOnline(client, dto.roomId, userId);
      const channel = gameChannel(dto.roomId);
      if (result.bothReady) {
        // Setup is complete — the play turn clock takes over.
        this.clearSetupTimer(dto.roomId);
        this.websocketsService.sendToChannel(channel, BATTLESHIP_EVENTS.start, {
          firstTurnUserId: result.firstTurnUserId,
          turnDeadline: result.turnDeadline,
        });
        this.armTurnTimer(dto.roomId);
      } else {
        this.armSetupTimer(dto.roomId, match.setupDeadline);
        this.websocketsService.sendToChannel(
          channel,
          BATTLESHIP_EVENTS.opponentReady,
          { userId },
        );
      }
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(BATTLESHIP_EVENTS.fire)
  async handleFire(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: BattleshipFireDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const payload = this.matchService.fire(
        dto.roomId,
        userId,
        dto.kind,
        dto.row,
        dto.col,
      );
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        BATTLESHIP_EVENTS.shot,
        payload,
      );
      if (payload.winnerUserId) {
        await this.endMatch(dto.roomId);
      } else {
        // Any accepted move restarts the turn clock.
        this.armTurnTimer(dto.roomId);
      }
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(BATTLESHIP_EVENTS.forfeit)
  async handleForfeit(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: BattleshipForfeitDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { winnerUserId } = this.matchService.forfeit(dto.roomId, userId);
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        BATTLESHIP_EVENTS.ended,
        { winnerUserId, reason: 'forfeit' },
      );
      await this.endMatch(dto.roomId);
    } catch (error) {
      this.emitError(client, error);
    }
  }

  // --- setup clock -----------------------------------------------------------

  /** Idempotent — the first enter/ready arms it, later calls are no-ops. */
  private armSetupTimer(roomId: string, deadline: number): void {
    if (this.setupTimers.has(roomId)) {
      return;
    }
    this.setupTimers.set(
      roomId,
      setTimeout(
        () => {
          void this.handleSetupTimeout(roomId);
        },
        Math.max(0, deadline - Date.now()),
      ),
    );
  }

  private clearSetupTimer(roomId: string): void {
    const timer = this.setupTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.setupTimers.delete(roomId);
    }
  }

  private async handleSetupTimeout(roomId: string): Promise<void> {
    this.setupTimers.delete(roomId);
    try {
      const { winnerUserId } = this.matchService.timeoutSetup(roomId);
      this.websocketsService.sendToChannel(
        gameChannel(roomId),
        BATTLESHIP_EVENTS.ended,
        { winnerUserId, reason: 'setup-timeout' },
      );
      await this.endMatch(roomId);
    } catch {
      // The match started or ended in the meantime — nothing to enforce.
    }
  }

  // --- turn clock ------------------------------------------------------------

  private armTurnTimer(roomId: string): void {
    this.clearTurnTimer(roomId);
    this.turnTimers.set(
      roomId,
      setTimeout(() => {
        void this.handleTurnTimeout(roomId);
      }, TURN_SECONDS * 1000),
    );
  }

  private clearTurnTimer(roomId: string): void {
    const timer = this.turnTimers.get(roomId);
    if (timer) {
      clearTimeout(timer);
      this.turnTimers.delete(roomId);
    }
  }

  private async handleTurnTimeout(roomId: string): Promise<void> {
    try {
      const payload = this.matchService.timeoutTurn(roomId);
      this.websocketsService.sendToChannel(
        gameChannel(roomId),
        BATTLESHIP_EVENTS.turnTimeout,
        payload,
      );
      if (payload.winnerUserId) {
        await this.endMatch(roomId);
      } else {
        this.armTurnTimer(roomId);
      }
    } catch {
      this.clearTurnTimer(roomId);
    }
  }

  private async endMatch(roomId: string): Promise<void> {
    this.clearTurnTimer(roomId);
    this.clearSetupTimer(roomId);
    // Keep the finished match in memory so both players can fetch the "over"
    // state; just mark the room done in the DB.
    await this.dbService.completeGameRoom(roomId);
  }

  // --- presence --------------------------------------------------------------

  private markOnline(
    client: SocketWithUser,
    roomId: string,
    userId: string,
  ): void {
    if (this.matchService.setPresence(roomId, userId, true)) {
      this.broadcastPresence(roomId, userId, true);
    }
    client.once('disconnect', () => {
      if (this.matchService.setPresence(roomId, userId, false)) {
        this.broadcastPresence(roomId, userId, false);
      }
    });
  }

  private broadcastPresence(
    roomId: string,
    userId: string,
    online: boolean,
  ): void {
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      BATTLESHIP_EVENTS.presence,
      { userId, online },
    );
  }

  private async loadParticipantRoom(
    roomId: string,
    userId: string,
  ): Promise<GameRoomEntity> {
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room) {
      throw new Error('Game room not found.');
    }
    if (room.userId !== userId && room.opponentId !== userId) {
      throw new Error('You are not part of this room.');
    }
    return room;
  }

  private emitError(client: SocketWithUser, error: unknown): void {
    const message =
      error instanceof Error ? error.message : 'Something went wrong.';
    client.emit(BATTLESHIP_EVENTS.error, { message });
  }
}
