import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';

import { CacheKeys, CacheService, roomAbandonMember } from '../cache';
import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameRoomStatus } from '../db/types/game';
import { WebsocketsService } from '../websockets';
import { GamesService } from './games.service';
import { participantsOf } from './room.util';

// Long enough to cover a tab reload or a tunnel change.
export const PENDING_ROOM_ABANDON_SECONDS = 30;

// Counted from creation or from the last sweep that saw the creator online.
export const STALE_LOBBY_IDLE_MS = 15 * 60 * 1000;
const STALE_SWEEP_INTERVAL_MS = 60_000;
const CREATOR_SEEN_TTL_SECONDS = (2 * STALE_LOBBY_IDLE_MS) / 1000;

@Injectable()
export class RoomAbandonService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RoomAbandonService.name);
  private staleInterval?: ReturnType<typeof setInterval>;
  private staleSweeping = false;

  constructor(
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
    private readonly gamesService: GamesService,
  ) {}

  onModuleInit(): void {
    this.websocketsService.onLastSocketClosed(userId => {
      void this.schedule(userId).catch(error => {
        this.logger.error(
          `Failed to schedule room abandon for ${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
      });
    });
    this.staleInterval = setInterval(() => {
      void this.sweepStale().catch(error => {
        this.logger.error(
          'Stale-lobby sweep failed',
          error instanceof Error ? error.stack : String(error),
        );
      });
    }, STALE_SWEEP_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.staleInterval) {
      clearInterval(this.staleInterval);
    }
  }

  async schedule(userId: string): Promise<void> {
    const room = await this.dbService.findActiveGameRoomForParticipant(userId);
    if (
      !room ||
      room.status !== GameRoomStatus.Pending ||
      !participantsOf(room).includes(userId)
    ) {
      return;
    }
    await this.cacheService.addDeadline(
      roomAbandonMember(room.id, userId),
      Date.now() + PENDING_ROOM_ABANDON_SECONDS * 1000,
    );
  }

  // The member outlives reconnects and restarts, so every precondition is re-checked; nothing is ever unscheduled.
  async enforce(roomId: string, userId: string): Promise<void> {
    if (await this.websocketsService.isUserOnline(userId)) {
      return;
    }
    const room = await this.dbService.findGameRoomByIdFresh(roomId);
    if (!room || room.status !== GameRoomStatus.Pending) {
      return;
    }
    try {
      if (room.userId === userId) {
        await this.gamesService.closeRoom(userId, roomId);
      } else if (participantsOf(room).includes(userId)) {
        await this.gamesService.leaveRoom(userId, roomId);
      }
    } catch (error) {
      // Raced a join/start/close between the checks and the write.
      this.logger.log(
        `Abandon cleanup for room ${roomId} skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  async sweepStale(now = Date.now()): Promise<void> {
    if (this.staleSweeping) {
      return;
    }
    this.staleSweeping = true;
    try {
      const rooms = await this.dbService.findPendingGameRoomsCreatedBefore(
        new Date(now - STALE_LOBBY_IDLE_MS),
      );
      for (const room of rooms) {
        try {
          await this.reapIfCreatorGone(room, now);
        } catch (error) {
          // Raced a join/start/close, or another instance's sweep won.
          this.logger.log(
            `Stale cleanup for room ${room.id} skipped: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } finally {
      this.staleSweeping = false;
    }
  }

  private async reapIfCreatorGone(
    room: GameRoomEntity,
    now: number,
  ): Promise<void> {
    const seenKey = CacheKeys.lobbyCreatorSeen(room.id);
    if (await this.websocketsService.isUserOnline(room.userId)) {
      await this.cacheService.set(seenKey, String(now), CREATOR_SEEN_TTL_SECONDS);
      return;
    }
    const seen = Number(await this.cacheService.get(seenKey));
    const idleSince = seen > 0 ? seen : room.createdAt.getTime();
    if (now - idleSince < STALE_LOBBY_IDLE_MS) {
      return;
    }
    await this.gamesService.closeRoom(room.userId, room.id);
    await this.cacheService.del(seenKey);
  }
}
