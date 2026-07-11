import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { BATTLESHIP_EVENTS, GameRoomSummary } from '@gaming-platform/core';

import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameRoomStatus, GameType } from '../db/types/game';
import { WebsocketsService } from '../websockets';
import { gameChannel } from '../websockets/rooms.util';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { getPlayerCountForGameType } from './game-type.util';

@Injectable()
export class GamesService {
  constructor(
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
    private readonly battleshipMatchService: BattleshipMatchService,
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

  /**
   * The user's active (Pending/InProgress) room as either creator or opponent,
   * if any — used on app start to resume a "waiting" room or offer to rejoin an
   * in-progress match.
   */
  async getMyActiveRoom(userId: string): Promise<GameRoomSummary | null> {
    const room = await this.dbService.findActiveGameRoomForParticipant(userId);
    return room ? toGameRoomSummary(room) : null;
  }

  /**
   * Give up an in-progress match: the opponent wins. Unlike closeRoom (which
   * only deletes a not-yet-started room), this completes a live match so a
   * player can quit from the lobby without opening the game. A Pending room has
   * no match to forfeit — close it instead.
   */
  async forfeitRoom(
    userId: string,
    roomId: string,
  ): Promise<{ winnerUserId: string }> {
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }
    if (room.userId !== userId && room.opponentId !== userId) {
      throw new ForbiddenException('You are not part of this room.');
    }
    if (room.status !== GameRoomStatus.InProgress || !room.opponentId) {
      throw new ConflictException('Only an in-progress match can be forfeited.');
    }

    const opponentId =
      room.userId === userId ? room.opponentId : room.userId;

    // Update the cached match if it's still around; if it expired or never
    // existed, completing the DB room is enough to end it.
    try {
      await this.battleshipMatchService.forfeit(roomId, userId);
    } catch {
      // No live match — fall through to the DB completion below.
    }
    await this.dbService.completeGameRoom(roomId);

    // Tell the channel so an opponent still in the match sees the win. (Any
    // scheduled turn deadline goes stale — the sweeper re-validates the phase
    // and drops it.)
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      BATTLESHIP_EVENTS.ended,
      { winnerUserId: opponentId, reason: 'forfeit' },
    );

    return { winnerUserId: opponentId };
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
