import { Injectable, NotFoundException } from '@nestjs/common';

import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { UserEntity } from '../db/entities/user.entity';
import { GameRoomStatus, GameType } from '../db/types/game';
import { participantsOf } from '../games/room.util';
import { WebsocketsService } from '../websockets';

export interface AdminUserView {
  id: string;
  email: string;
  username: string | null;
  createdAt: string;
  /** Has at least one open socket on this instance right now. */
  online: boolean;
}

export interface AdminGameRoomView {
  id: string;
  gameType: number;
  gameTypeLabel: string;
  status: number;
  statusLabel: string;
  playerCount: number;
  joinedCount: number;
  code: string | null;
  isPrivate: boolean;
  stakeToken: number | null;
  stakeAmount: string | null;
  creatorId: string;
  winnerUserId: string | null;
  createdAt: string;
}

export interface DeleteUserResult {
  deleted: boolean;
  walletsDeleted: number;
}

/** Operator-only reads and actions behind the AdminTokenGuard. */
@Injectable()
export class AdminService {
  constructor(
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
  ) {}

  /** Every user, newest first, flagged with live-connection status. */
  async listUsers(): Promise<AdminUserView[]> {
    const users = await this.dbService.findAllUsers();
    const online = new Set(this.websocketsService.getOnlineUserIds());
    return users.map(user => this.toUserView(user, online));
  }

  /** Users with at least one live socket connection right now. */
  async listActiveUsers(): Promise<AdminUserView[]> {
    const online = new Set(this.websocketsService.getOnlineUserIds());
    if (online.size === 0) {
      return [];
    }
    const users = await this.dbService.findUsersByIds([...online]);
    return users.map(user => this.toUserView(user, online));
  }

  /** Every live room (Pending or InProgress), newest first. */
  async listActiveGames(): Promise<AdminGameRoomView[]> {
    const rooms = await this.dbService.findActiveGameRooms();
    return rooms.map(room => this.toGameView(room));
  }

  /**
   * Hard-deletes a user and their wallets. Game rooms are left intact by
   * design - the now-orphaned id resolves to "unknown" wherever history or
   * opponent lookups reference it (they already null-coalesce a missing user).
   * The user's email_login_tokens go via the DB cascade.
   */
  async deleteUser(id: string): Promise<DeleteUserResult> {
    const user = await this.dbService.findUserById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const walletsDeleted = await this.dbService.deleteWalletsForUser(id);
    const deleted = await this.dbService.deleteUser(id);
    return { deleted, walletsDeleted };
  }

  private toUserView(user: UserEntity, online: Set<string>): AdminUserView {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
      online: online.has(user.id),
    };
  }

  private toGameView(room: GameRoomEntity): AdminGameRoomView {
    return {
      id: room.id,
      gameType: room.gameType,
      gameTypeLabel: GameType[room.gameType] ?? String(room.gameType),
      status: room.status,
      statusLabel: GameRoomStatus[room.status] ?? String(room.status),
      playerCount: room.playerCount,
      joinedCount: participantsOf(room).length,
      code: room.code,
      isPrivate: room.isPrivate,
      stakeToken: room.stakeToken,
      stakeAmount: room.stakeAmount,
      creatorId: room.userId,
      winnerUserId: room.winnerUserId,
      createdAt: room.createdAt.toISOString(),
    };
  }
}
