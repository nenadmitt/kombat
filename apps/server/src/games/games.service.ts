import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { GameRoomSummary } from '@gaming-platform/core';

import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameRoomStatus, GameType } from '../db/types/game';
import { getPlayerCountForGameType } from './game-type.util';

@Injectable()
export class GamesService {
  constructor(private readonly dbService: DbService) {}

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

  async listPendingRooms(): Promise<GameRoomSummary[]> {
    const rooms = await this.dbService.findPendingGameRooms();
    return rooms.map(toGameRoomSummary);
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
