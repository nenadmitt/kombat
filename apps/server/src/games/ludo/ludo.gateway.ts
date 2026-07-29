import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { LUDO_EVENTS } from '@gaming-platform/core';

import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { participantsOf } from '../room.util';
import { gameChannel } from '../../websockets/rooms.util';
import { WebsocketsService } from '../../websockets';
import { StakesService } from '../stakes/stakes.service';
import { LudoMatchService } from './ludo-match.service';
import {
  LudoEnterDto,
  LudoForfeitDto,
  LudoMoveDto,
  LudoRollDto,
} from './ludo.dto';

type SocketWithUser = Socket & { data: { userId?: string } };

/**
 * Ludo realtime handlers. Same shape as BattleshipGateway: shares the one
 * socket.io server (WebsocketsGateway owns auth), holds no gameplay state -
 * matches live in the cache via LudoMatchService and turn timeouts are
 * enforced by the shared GameDeadlineSweeper.
 */
@WebSocketGateway({ cors: true })
export class LudoGateway {
  constructor(
    private readonly matchService: LudoMatchService,
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
    private readonly stakesService: StakesService,
  ) {}

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(LUDO_EVENTS.enter)
  async handleEnter(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: LudoEnterDto,
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
  @SubscribeMessage(LUDO_EVENTS.roll)
  async handleRoll(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: LudoRollDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const payload = await this.matchService.roll(dto.roomId, userId);
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        LUDO_EVENTS.rolled,
        payload,
      );
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(LUDO_EVENTS.move)
  async handleMove(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: LudoMoveDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const payload = await this.matchService.move(
        dto.roomId,
        userId,
        dto.tokenIndex,
      );
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        LUDO_EVENTS.moved,
        payload,
      );
      if (payload.winnerUserId) {
        await this.stakesService.completeMatch(
          dto.roomId,
          payload.winnerUserId,
          'complete',
        );
      }
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(LUDO_EVENTS.forfeit)
  async handleForfeit(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: LudoForfeitDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const payload = await this.matchService.forfeit(dto.roomId, userId);
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        LUDO_EVENTS.eliminated,
        payload,
      );
      if (payload.winnerUserId) {
        this.websocketsService.sendToChannel(
          gameChannel(dto.roomId),
          LUDO_EVENTS.ended,
          { winnerUserId: payload.winnerUserId, reason: 'forfeit' },
        );
        await this.stakesService.completeMatch(
          dto.roomId,
          payload.winnerUserId,
          'forfeit',
        );
      }
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
      LUDO_EVENTS.presence,
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
    client.emit(LUDO_EVENTS.error, { message });
  }
}
