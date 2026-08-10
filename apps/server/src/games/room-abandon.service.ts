import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

import { CacheService, roomAbandonMember } from '../cache';
import { DbService } from '../db';
import { GameRoomStatus } from '../db/types/game';
import { WebsocketsService } from '../websockets';
import { GamesService } from './games.service';
import { participantsOf } from './room.util';

/** Grace window a disconnected player gets before their not-yet-started room
 *  is given up on. Long enough to cover a tab reload or a tunnel change. */
export const PENDING_ROOM_ABANDON_SECONDS = 30;

/**
 * A player whose socket drops while their room is still Pending has the room
 * closed (creator) or their seat freed (joiner) after the grace window, via
 * the same GamesService calls the manual endpoints use. Started matches are
 * left to the turn clock, which already hands a vanished player the loss.
 */
@Injectable()
export class RoomAbandonService implements OnModuleInit {
  private readonly logger = new Logger(RoomAbandonService.name);

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

  /**
   * The member outlives reconnects and restarts, so every precondition is
   * re-checked here - a stale one must never delete a live room. Coming back
   * online is what cancels the cleanup; nothing is unscheduled.
   */
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
      // Raced a join/start/close between the checks above and the write.
      this.logger.log(
        `Abandon cleanup for room ${roomId} skipped: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
