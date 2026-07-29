import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { BATTLESHIP_EVENTS } from '@gaming-platform/core';

import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { gameChannel } from '../../websockets/rooms.util';
import { WebsocketsService } from '../../websockets';
import { StakesService } from '../stakes/stakes.service';
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
 *
 * Holds no gameplay state: matches live in the cache (via
 * BattleshipMatchService) and setup/turn timeouts are enforced by the shared
 * GameDeadlineSweeper off the shared deadline schedule.
 */
@WebSocketGateway({ cors: true })
export class BattleshipGateway {
  constructor(
    private readonly matchService: BattleshipMatchService,
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
    private readonly stakesService: StakesService,
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
      const room = await this.loadParticipantRoom(dto.roomId, userId, true);
      // Staked rooms are playable only once the pot is escrowed (Funded).
      await this.stakesService.assertRoomPlayable(room);
      // The match may not exist yet if this is the first player in; create it
      // so presence can be recorded before either side has submitted a fleet.
      // Creation also schedules the setup deadline.
      const match = await this.matchService.getOrCreate(room);
      if (match.phase === 'setup') {
        // Push the countdown to this player directly — the REST snapshot may
        // have been fetched before the match (and its deadline) existed.
        client.emit(BATTLESHIP_EVENTS.setupState, {
          setupDeadline: match.setupDeadline,
        });
      }
      await this.markOnline(client, dto.roomId, userId);
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
      await this.stakesService.assertRoomPlayable(room);
      await this.matchService.getOrCreate(room);
      const result = await this.matchService.setFleet(
        dto.roomId,
        userId,
        dto.placements,
        dto.mines,
      );
      await this.markOnline(client, dto.roomId, userId);
      const channel = gameChannel(dto.roomId);
      if (result.bothReady) {
        // Setup is complete — the play turn deadline (scheduled by setFleet)
        // takes over.
        this.websocketsService.sendToChannel(channel, BATTLESHIP_EVENTS.start, {
          firstTurnUserId: result.firstTurnUserId,
          turnDeadline: result.turnDeadline,
        });
      } else {
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
      const payload = await this.matchService.fire(
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
        await this.endMatch(dto.roomId, payload.winnerUserId, 'complete');
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
      const { winnerUserId } = await this.matchService.forfeit(
        dto.roomId,
        userId,
      );
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        BATTLESHIP_EVENTS.ended,
        { winnerUserId, reason: 'forfeit' },
      );
      await this.endMatch(dto.roomId, winnerUserId, 'forfeit');
    } catch (error) {
      this.emitError(client, error);
    }
  }

  /**
   * Mark the room done (with its persisted result) and queue any stake
   * settlement. The finished match stays in the cache so both players can
   * fetch the "over" state; its TTL handles cleanup. Any still-scheduled
   * deadline goes stale (phase is 'over') and the sweeper drops it.
   */
  private async endMatch(
    roomId: string,
    winnerUserId: string | null,
    endReason: string,
  ): Promise<void> {
    await this.stakesService.completeMatch(roomId, winnerUserId, endReason);
  }

  // --- presence --------------------------------------------------------------

  private async markOnline(
    client: SocketWithUser,
    roomId: string,
    userId: string,
  ): Promise<void> {
    if (await this.matchService.setPresence(roomId, userId, true)) {
      this.broadcastPresence(roomId, userId, true);
    }
    client.once('disconnect', () => {
      void this.matchService
        .setPresence(roomId, userId, false)
        .then(active => {
          if (active) {
            this.broadcastPresence(roomId, userId, false);
          }
        })
        .catch(() => {
          // Best effort — presence flags self-correct on the next enter.
        });
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

  /**
   * `fresh` bypasses the room cache. Only the enter path needs it: it decides
   * whether the match may start, and a stale Pending copy (possible on a
   * second instance when running without Redis) strands the whole room on a
   * loading spinner. Per-action calls stay on the cache.
   */
  private async loadParticipantRoom(
    roomId: string,
    userId: string,
    fresh = false,
  ): Promise<GameRoomEntity> {
    const room = fresh
      ? await this.dbService.findGameRoomByIdFresh(roomId)
      : await this.dbService.findGameRoomById(roomId);
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
