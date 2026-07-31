import { UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import type { Socket } from 'socket.io';
import { CHROMA_EVENTS, ChromaCard } from '@gaming-platform/core';

import { DbService } from '../../db';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { participantsOf } from '../room.util';
import { registerPresenceHook } from '../presence.util';
import { gameChannel } from '../../websockets/rooms.util';
import { WebsocketsService } from '../../websockets';
import { StakesService } from '../stakes/stakes.service';
import { ChromaMatchService } from './chroma-match.service';
import {
  ChromaDrawDto,
  ChromaEnterDto,
  ChromaForfeitDto,
  ChromaPassDto,
  ChromaPickColorDto,
  ChromaPlayDto,
} from './chroma.dto';

type SocketWithUser = Socket & { data: { userId?: string } };

/**
 * ChromaClash realtime handlers - same shape as the other game gateways.
 * Hidden-hand discipline lives here: every mutation broadcasts its public
 * payload to the room channel, then pushes each changed hand privately to
 * its owner via the caller-only `hand` event.
 */
@WebSocketGateway({ cors: true })
export class ChromaGateway {
  constructor(
    private readonly matchService: ChromaMatchService,
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
    private readonly stakesService: StakesService,
  ) {}

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(CHROMA_EVENTS.enter)
  async handleEnter(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: ChromaEnterDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      const room = await this.loadParticipantRoom(dto.roomId, userId, true);
      await this.stakesService.assertRoomPlayable(room);
      const match = await this.matchService.getOrCreate(room);
      // Own hand rides a caller-only push, never the channel.
      client.emit(CHROMA_EVENTS.hand, {
        cards: match.hands[userId] ?? [],
      });
      await this.markOnline(client, dto.roomId, userId);
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(CHROMA_EVENTS.play)
  async handlePlay(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: ChromaPlayDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { payload, changedHands } = await this.matchService.play(
        dto.roomId,
        userId,
        dto.handIndex,
        dto.solo,
      );
      this.broadcast(dto.roomId, CHROMA_EVENTS.played, payload, changedHands);
      if (payload.winnerUserId) {
        await this.endMatch(dto.roomId, payload.winnerUserId);
      }
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(CHROMA_EVENTS.draw)
  async handleDraw(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: ChromaDrawDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { payload, changedHands } = await this.matchService.draw(
        dto.roomId,
        userId,
      );
      this.broadcast(dto.roomId, CHROMA_EVENTS.drew, payload, changedHands);
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(CHROMA_EVENTS.pass)
  async handlePass(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: ChromaPassDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { payload } = await this.matchService.pass(dto.roomId, userId);
      this.broadcast(dto.roomId, CHROMA_EVENTS.passed, payload, {});
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(CHROMA_EVENTS.pickColor)
  async handlePickColor(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: ChromaPickColorDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { payload, changedHands } = await this.matchService.pickColor(
        dto.roomId,
        userId,
        dto.suit,
      );
      this.broadcast(
        dto.roomId,
        CHROMA_EVENTS.colorPicked,
        payload,
        changedHands,
      );
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(CHROMA_EVENTS.forfeit)
  async handleForfeit(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: ChromaForfeitDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { payload } = await this.matchService.forfeit(dto.roomId, userId);
      this.broadcast(dto.roomId, CHROMA_EVENTS.eliminated, payload, {});
      if (payload.winnerUserId) {
        this.websocketsService.sendToChannel(
          gameChannel(dto.roomId),
          CHROMA_EVENTS.ended,
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

  /** Channel broadcast + private hand pushes for every changed hand. */
  private broadcast(
    roomId: string,
    event: string,
    payload: unknown,
    changedHands: Record<string, ChromaCard[]>,
  ): void {
    this.websocketsService.sendToChannel(gameChannel(roomId), event, payload);
    for (const [userId, cards] of Object.entries(changedHands)) {
      this.websocketsService.sendToUser(userId, CHROMA_EVENTS.hand, { cards });
    }
  }

  private async endMatch(roomId: string, winnerUserId: string): Promise<void> {
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      CHROMA_EVENTS.ended,
      { winnerUserId, reason: 'complete' },
    );
    await this.stakesService.completeMatch(roomId, winnerUserId, 'complete');
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
    registerPresenceHook(client, roomId, () => {
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
      CHROMA_EVENTS.presence,
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
    client.emit(CHROMA_EVENTS.error, { message });
  }
}
