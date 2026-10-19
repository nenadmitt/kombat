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
import { registerPresenceHook } from '../presence.util';
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

  private async markOnline(
    client: SocketWithUser,
    roomId: string,
    userId: string,
  ): Promise<void> {
    if (await this.matchService.setPresence(roomId, userId, true)) {
      this.broadcastPresence(roomId, userId, true);
    }
    registerPresenceHook(client, roomId, () => {
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

  // `fresh` bypasses the room cache; only enter needs it, since it decides whether the match may start.
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
    // Never a seat column directly: two-player and multi-seat joiners sit in different columns.
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
