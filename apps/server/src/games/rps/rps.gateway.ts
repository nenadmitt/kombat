import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { RPS_EVENTS } from '@gaming-platform/core';

import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { participantsOf } from '../room.util';
import { registerPresenceHook } from '../presence.util';
import { gameChannel } from '../../websockets/rooms.util';
import { WebsocketsService } from '../../websockets';
import { StakesService } from '../stakes/stakes.service';
import { RpsMatchService } from './rps-match.service';
import { RpsEnterDto, RpsForfeitDto, RpsLockDto } from './rps.dto';

type SocketWithUser = Socket & { data: { userId?: string } };

@WebSocketGateway({ cors: true })
export class RpsGateway {
  constructor(
    private readonly matchService: RpsMatchService,
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
    private readonly stakesService: StakesService,
  ) {}

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(RPS_EVENTS.enter)
  async handleEnter(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: RpsEnterDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      const room = await this.loadParticipantRoom(dto.roomId, userId, true);
      await this.stakesService.assertRoomPlayable(room);
      await this.matchService.getOrCreate(room);
      await this.markOnline(client, dto.roomId, userId);
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(RPS_EVENTS.lock)
  async handleLock(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: RpsLockDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { bothLocked, reveal } = await this.matchService.lock(
        dto.roomId,
        userId,
        dto.move,
      );
      const channel = gameChannel(dto.roomId);
      // Broadcast only that a move was locked, never the move, until the reveal.
      this.websocketsService.sendToChannel(channel, RPS_EVENTS.locked, {
        userId,
        bothLocked,
      });
      if (reveal) {
        this.websocketsService.sendToChannel(
          channel,
          RPS_EVENTS.reveal,
          reveal,
        );
        if (reveal.winnerUserId) {
          await this.stakesService.completeMatch(
            dto.roomId,
            reveal.winnerUserId,
            'complete',
          );
        }
      }
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(RPS_EVENTS.forfeit)
  async handleForfeit(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: RpsForfeitDto,
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
        RPS_EVENTS.ended,
        { winnerUserId, reason: 'forfeit' },
      );
      await this.stakesService.completeMatch(dto.roomId, winnerUserId, 'forfeit');
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
        .catch(() => {
          // Best effort: presence flags self-correct on the next enter.
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
      RPS_EVENTS.presence,
      { userId, online },
    );
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
      throw new Error('Game room not found.');
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
    client.emit(RPS_EVENTS.error, { message });
  }
}
