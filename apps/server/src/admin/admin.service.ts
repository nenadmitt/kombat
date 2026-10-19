import { Injectable, NotFoundException } from '@nestjs/common';

import { DbService, type RoomTotals, type UserRoomTotals } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { UserEntity } from '../db/entities/user.entity';
import { GameRoomStatus, GameType } from '../db/types/game';
import { participantsOf } from '../games/room.util';
import { WebsocketsService } from '../websockets';

const PLATFORM_LABELS: Record<number, string> = { 0: 'mobile', 1: 'web' };

function platformLabel(platform: number | null): string | null {
  return platform === null ? null : PLATFORM_LABELS[platform] ?? String(platform);
}

interface TypeCount {
  gameType: number;
  gameTypeLabel: string;
  total: number;
  staked: number;
}

export interface AdminStatsOverview {
  users: {
    total: number;
    online: number;
    byPlatform: { platform: number; label: string; users: number }[] | null;
  };
  games: RoomTotals & { byType: TypeCount[] };
}

export interface AdminUserStatsRow {
  id: string;
  email: string | null;
  username: string | null;
  createdAt: string;
  online: boolean;
  platform: number | null;
  platformLabel: string | null;
  games: number;
  staked: number;
  free: number;
}

export interface AdminUserStats {
  id: string;
  email: string | null;
  username: string | null;
  ensName: string | null;
  referralCode: string | null;
  referredByUserId: string | null;
  createdAt: string;
  online: boolean;
  platform: number | null;
  platformLabel: string | null;
  totals: UserRoomTotals & { losses: number };
  byType: TypeCount[];
}

export interface AdminUserView {
  id: string;
  email: string | null;
  username: string | null;
  createdAt: string;
  online: boolean;
  isBot: boolean;
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

@Injectable()
export class AdminService {
  constructor(
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
  ) {}

  async listUsers(): Promise<AdminUserView[]> {
    const users = await this.dbService.findAllUsers();
    const online = new Set(this.websocketsService.getOnlineUserIds());
    return users.map(user => this.toUserView(user, online));
  }

  async listActiveUsers(): Promise<AdminUserView[]> {
    const online = new Set(this.websocketsService.getOnlineUserIds());
    if (online.size === 0) {
      return [];
    }
    const users = await this.dbService.findUsersByIds([...online]);
    return users.map(user => this.toUserView(user, online));
  }

  async getStatsOverview(): Promise<AdminStatsOverview> {
    const [totals, byType, platforms] = await Promise.all([
      this.dbService.findRoomTotals(),
      this.dbService.findRoomCountsByType(),
      this.dbService.findUserPlatforms(),
    ]);
    const users = await this.dbService.countUsers();

    let byPlatform: AdminStatsOverview['users']['byPlatform'] = null;
    if (platforms) {
      const counts = new Map<number, number>();
      for (const platform of platforms.values()) {
        counts.set(platform, (counts.get(platform) ?? 0) + 1);
      }
      byPlatform = [...counts.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([platform, count]) => ({
          platform,
          label: platformLabel(platform) ?? String(platform),
          users: count,
        }));
    }

    return {
      users: {
        total: users,
        online: this.websocketsService.getOnlineUserIds().length,
        byPlatform,
      },
      games: { ...totals, byType: byType.map(row => this.toTypeCount(row)) },
    };
  }

  async listUserStats(): Promise<AdminUserStatsRow[]> {
    const [users, played, platforms] = await Promise.all([
      this.dbService.findAllUsers(),
      this.dbService.findRoomCountsByParticipant(),
      this.dbService.findUserPlatforms(),
    ]);
    const online = new Set(this.websocketsService.getOnlineUserIds());

    return users.map(user => {
      const counts = played.get(user.id) ?? { games: 0, staked: 0 };
      const platform = platforms?.get(user.id) ?? null;
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        createdAt: user.createdAt.toISOString(),
        online: online.has(user.id),
        platform,
        platformLabel: platformLabel(platform),
        games: counts.games,
        staked: counts.staked,
        free: counts.games - counts.staked,
      };
    });
  }

  async getUserStats(id: string): Promise<AdminUserStats> {
    const user = await this.dbService.findUserById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const [totals, byType, platforms] = await Promise.all([
      this.dbService.findRoomTotalsForUser(id),
      this.dbService.findRoomCountsByTypeForUser(id),
      this.dbService.findUserPlatforms(),
    ]);
    const platform = platforms?.get(id) ?? null;

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      ensName: user.ensName,
      referralCode: user.referralCode,
      referredByUserId: user.referredByUserId,
      createdAt: user.createdAt.toISOString(),
      online: this.websocketsService.getOnlineUserIds().includes(id),
      platform,
      platformLabel: platformLabel(platform),
      totals: {
        ...totals,
        losses: totals.completed - totals.wins - totals.voids,
      },
      byType: byType.map(row => this.toTypeCount(row)),
    };
  }

  async listActiveGames(): Promise<AdminGameRoomView[]> {
    const rooms = await this.dbService.findActiveGameRooms();
    return rooms.map(room => this.toGameView(room));
  }

  // Game rooms are kept; the orphaned id resolves to "unknown" wherever it is referenced.
  async deleteUser(id: string): Promise<DeleteUserResult> {
    const user = await this.dbService.findUserById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const walletsDeleted = await this.dbService.deleteWalletsForUser(id);
    const deleted = await this.dbService.deleteUser(id);
    return { deleted, walletsDeleted };
  }

  async setUserBot(id: string, isBot: boolean): Promise<AdminUserView> {
    const user = await this.dbService.findUserById(id);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.dbService.setUserIsBot(id, isBot);
    const online = new Set(this.websocketsService.getOnlineUserIds());
    return this.toUserView({ ...user, isBot }, online);
  }

  private toTypeCount(row: {
    gameType: number;
    total: number;
    staked: number;
  }): TypeCount {
    return {
      gameType: row.gameType,
      gameTypeLabel: GameType[row.gameType] ?? String(row.gameType),
      total: row.total,
      staked: row.staked,
    };
  }

  private toUserView(user: UserEntity, online: Set<string>): AdminUserView {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      createdAt: user.createdAt.toISOString(),
      online: online.has(user.id),
      isBot: user.isBot,
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
