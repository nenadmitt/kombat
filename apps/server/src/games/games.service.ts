import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GameRoomSummary } from '@gaming-platform/core';

import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameRoomStatus, GameType } from '../db/types/game';
import { WebsocketsService } from '../websockets';
import { getPlayerCountForGameType } from './game-type.util';

@Injectable()
export class GamesService {
  constructor(
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
  ) {}

  async createRoom(
    userId: string,
    gameType: GameType,
  ): Promise<GameRoomSummary> {
    const existing = await this.dbService.findOpenGameRoomForUser(userId);
    if (existing) {
      throw new ConflictException(
        'You already have an active game room. Close it before creating another.',
      );
    }

    const room = await this.dbService.createGameRoom({
      userId,
      gameType,
      status: GameRoomStatus.Pending,
      playerCount: getPlayerCountForGameType(gameType),
    });

    return toGameRoomSummary(room);
  }

  /**
   * Closing removes the room entirely — a room that never started has
   * nothing worth keeping around. Only allowed while still Pending.
   */
  async closeRoom(userId: string, roomId: string): Promise<void> {
    const room = await this.dbService.findGameRoomForUser(roomId, userId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }

    if (room.status !== GameRoomStatus.Pending) {
      throw new ConflictException(
        'Only a room that has not started can be closed',
      );
    }

    await this.dbService.deleteGameRoom(roomId);
  }

  /**
   * Naval Battle is exactly 2 players, so joining immediately fills the
   * room — flips it to InProgress and notifies the creator so their app can
   * leave the "waiting" state automatically.
   */
  async joinRoom(userId: string, roomId: string): Promise<GameRoomSummary> {
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }

    if (room.userId === userId) {
      throw new ConflictException('You cannot join your own game room.');
    }

    if (room.status !== GameRoomStatus.Pending) {
      throw new ConflictException(
        'This room is no longer accepting players.',
      );
    }

    await this.dbService.joinGameRoom(roomId, userId);
    this.websocketsService.sendToUser(room.userId, 'game:opponent-joined', {
      roomId,
    });

    return toGameRoomSummary({
      ...room,
      opponentId: userId,
      status: GameRoomStatus.InProgress,
    });
  }

  async listPendingRooms(excludeUserId?: string): Promise<GameRoomSummary[]> {
    const rooms = await this.dbService.findPendingGameRooms(excludeUserId);
    return rooms.map(toGameRoomSummary);
  }

  /** The user's own open (Pending/InProgress) room, if any — used to resume a "waiting" state on app start. */
  async getMyActiveRoom(userId: string): Promise<GameRoomSummary | null> {
    const room = await this.dbService.findOpenGameRoomForUser(userId);
    return room ? toGameRoomSummary(room) : null;
  }
}

function toGameRoomSummary(room: GameRoomEntity): GameRoomSummary {
  return {
    id: room.id,
    gameType: room.gameType,
    status: room.status,
    playerCount: room.playerCount,
    createdAt: room.createdAt.toISOString(),
  };
}
