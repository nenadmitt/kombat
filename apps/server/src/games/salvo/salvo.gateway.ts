import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { SALVO_EVENTS } from '@gaming-platform/core';

import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { participantsOf } from '../room.util';
import { gameChannel } from '../../websockets/rooms.util';
import { WebsocketsService } from '../../websockets';
import { StakesService } from '../stakes/stakes.service';
import { SalvoMatchService } from './salvo-match.service';
import {
  SalvoEnterDto,
  SalvoFireDto,
  SalvoForfeitDto,
  SalvoMoveDto,
} from './salvo.dto';

type SocketWithUser = Socket & { data: { userId?: string } };

/**
 * Salvo realtime handlers - same shape as the other game gateways. Clients
 * send intent only (a column to drive to, an aim to fire with); every outcome
 * is computed by the match service and broadcast to the room channel.
 */
@WebSocketGateway({ cors: true })
export class SalvoGateway {
  constructor(
    private readonly matchService: SalvoMatchService,
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
    private readonly stakesService: StakesService,
  ) {}

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(SALVO_EVENTS.enter)
  async handleEnter(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: SalvoEnterDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      const room = await this.loadParticipantRoom(dto.roomId, userId, true);
      await this.stakesService.assertRoomPlayable(room);
      await this.matchService.getOrCreate(room);
      // The battlefield snapshot (terrain included) is a caller-only push;
      // it is identical for both players, but each needs it on entry.
      client.emit(SALVO_EVENTS.state, await this.matchService.stateFor(dto.roomId));
      await this.markOnline(client, dto.roomId, userId);
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(SALVO_EVENTS.move)
  async handleMove(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: SalvoMoveDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const payload = await this.matchService.move(dto.roomId, userId, dto.toX);
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        SALVO_EVENTS.moved,
        payload,
      );
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(SALVO_EVENTS.fire)
  async handleFire(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: SalvoFireDto,
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
        dto.angle,
        dto.power,
      );
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        SALVO_EVENTS.shot,
        payload,
      );
      if (payload.winnerUserId) {
        await this.stakesService.completeMatch(
          dto.roomId,
          payload.winnerUserId,
          'destroyed',
        );
      }
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(SALVO_EVENTS.forfeit)
  async handleForfeit(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: SalvoForfeitDto,
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
        SALVO_EVENTS.ended,
        { winnerUserId, reason: 'forfeit' },
      );
      await this.stakesService.completeMatch(
        dto.roomId,
        winnerUserId,
        'forfeit',
      );
    } catch (error) {
      this.emitError(client, error);
    }
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
    // Enter may fire many times on one socket (the client retries until its
    // snapshot lands, and reconnect replays it), so the disconnect hook must
    // be registered once per socket+room or every retry stacks another
    // listener (MaxListenersExceededWarning in the server logs).
    const data = client.data as { presenceHookedRooms?: Set<string> };
    if (data.presenceHookedRooms?.has(roomId)) {
      return;
    }
    (data.presenceHookedRooms ??= new Set()).add(roomId);
    client.once('disconnect', () => {
      void this.matchService
        .setPresence(roomId, userId, false)
        .then(active => {
          if (active) {
            this.broadcastPresence(roomId, userId, false);
          }
        })
        .catch(() => undefined);
    });
  }

  private broadcastPresence(
    roomId: string,
    userId: string,
    online: boolean,
  ): void {
    this.websocketsService.sendToChannel(gameChannel(roomId), SALVO_EVENTS.presence, {
      userId,
      online,
    });
  }

  // --- helpers ---------------------------------------------------------------

  /** Load the room and prove the caller is one of its two players. */
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
      throw new Error('Room not found.');
    }
    // participantsOf covers both seatings: a two-player joiner sits in
    // `opponent_id`, a multi-seat joiner in `opponent_ids`. Reading either
    // column directly is how Salvo rejected its own joiner.
    if (!participantsOf(room).includes(userId)) {
      throw new Error('You are not part of this room.');
    }
    return room;
  }

  private emitError(client: SocketWithUser, error: unknown): void {
    const message =
      error instanceof Error ? error.message : 'Something went wrong.';
    client.emit(SALVO_EVENTS.error, { message });
  }
}
