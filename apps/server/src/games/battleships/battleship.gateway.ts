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
import { participantsOf } from '../room.util';
import { registerPresenceHook } from '../presence.util';
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
      await this.stakesService.assertRoomPlayable(room);
      // Created on enter so presence can be recorded before either fleet is submitted.
      const match = await this.matchService.getOrCreate(room);
      if (match.phase === 'setup') {
        // The REST snapshot may predate the match and its deadline.
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

  private async endMatch(
    roomId: string,
    winnerUserId: string | null,
    endReason: string,
  ): Promise<void> {
    await this.stakesService.completeMatch(roomId, winnerUserId, endReason);
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
      BATTLESHIP_EVENTS.presence,
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
    client.emit(BATTLESHIP_EVENTS.error, { message });
  }
}
