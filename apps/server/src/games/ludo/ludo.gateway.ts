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
import { registerPresenceHook } from '../presence.util';
import { gameChannel } from '../../websockets/rooms.util';
import { WebsocketsService } from '../../websockets';
import { StakesService } from '../stakes/stakes.service';
import { LudoMatchService } from './ludo-match.service';
import {
  LudoEnterDto,
  LudoForfeitDto,
  LudoJumpDto,
  LudoLaunchDto,
  LudoMoveDto,
  LudoRollDto,
  LudoShieldDto,
  LudoTeleportDto,
} from './ludo.dto';

type SocketWithUser = Socket & { data: { userId?: string } };

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
      const moved = await this.matchService.move(
        dto.roomId,
        userId,
        dto.tokenIndex,
      );
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        LUDO_EVENTS.moved,
        moved,
      );
      if (moved.winnerUserId) {
        this.websocketsService.sendToChannel(
          gameChannel(dto.roomId),
          LUDO_EVENTS.ended,
          { winnerUserId: moved.winnerUserId, reason: 'complete' },
        );
        await this.stakesService.completeMatch(
          dto.roomId,
          moved.winnerUserId,
          'complete',
        );
      }
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(LUDO_EVENTS.launch)
  async handleLaunch(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: LudoLaunchDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { launched, owner } = await this.matchService.launch(
        dto.roomId,
        userId,
        dto.tokenIndex,
      );
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        LUDO_EVENTS.launched,
        launched,
      );
      this.websocketsService.sendToUser(
        userId,
        LUDO_EVENTS.abilityState,
        owner,
      );
      if (launched.winnerUserId) {
        this.websocketsService.sendToChannel(
          gameChannel(dto.roomId),
          LUDO_EVENTS.ended,
          { winnerUserId: launched.winnerUserId, reason: 'complete' },
        );
        await this.stakesService.completeMatch(
          dto.roomId,
          launched.winnerUserId,
          'complete',
        );
      }
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(LUDO_EVENTS.jump)
  async handleJump(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: LudoJumpDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { jumped, owner } = await this.matchService.addJumpAbility(
        dto.roomId,
        userId,
        dto.tokenIndex,
      );
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        LUDO_EVENTS.jumped,
        jumped,
      );
      this.websocketsService.sendToUser(
        userId,
        LUDO_EVENTS.abilityState,
        owner,
      );
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(LUDO_EVENTS.teleport)
  async handleTeleport(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: LudoTeleportDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { teleported, owner } = await this.matchService.teleport(
        dto.roomId,
        userId,
        dto.tokenIndex,
      );
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        LUDO_EVENTS.teleported,
        teleported,
      );
      this.websocketsService.sendToUser(
        userId,
        LUDO_EVENTS.abilityState,
        owner,
      );
    } catch (error) {
      this.emitError(client, error);
    }
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage(LUDO_EVENTS.shield)
  async handleShield(
    @ConnectedSocket() client: SocketWithUser,
    @MessageBody() dto: LudoShieldDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId) {
      return;
    }
    try {
      await this.loadParticipantRoom(dto.roomId, userId);
      const { shielded, owner } = await this.matchService.addShieldAbility(
        dto.roomId,
        userId,
        dto.tokenIndex,
      );
      this.websocketsService.sendToChannel(
        gameChannel(dto.roomId),
        LUDO_EVENTS.shielded,
        shielded,
      );
      this.websocketsService.sendToUser(
        userId,
        LUDO_EVENTS.abilityState,
        owner,
      );
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
      await this.dbService.recordEliminatedUser(dto.roomId, userId);
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
      LUDO_EVENTS.presence,
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
    client.emit(LUDO_EVENTS.error, { message });
  }
}
