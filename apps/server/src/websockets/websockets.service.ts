import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

import { INSTANCE_ID } from '../instance-id';
import { adapterState } from './redis-io.adapter';
import { channelRoom, userRoom } from './rooms.util';

const EMIT_LOGS = process.env.WS_EMIT_LOGS !== 'false';

@Injectable()
export class WebsocketsService {
  private readonly logger = new Logger(WebsocketsService.name);
  private server?: Server;
  // A count, not a set: socket replacement briefly overlaps the kicked socket. Per-instance only.
  private readonly onlineCounts = new Map<string, number>();
  private readonly goneListeners = new Set<(userId: string) => void>();

  setServer(server: Server): void {
    this.server = server;
  }

  markConnected(userId: string): void {
    this.onlineCounts.set(userId, (this.onlineCounts.get(userId) ?? 0) + 1);
  }

  markDisconnected(userId: string): void {
    const next = (this.onlineCounts.get(userId) ?? 0) - 1;
    if (next > 0) {
      this.onlineCounts.set(userId, next);
      return;
    }
    this.onlineCounts.delete(userId);
    for (const listener of this.goneListeners) {
      try {
        listener(userId);
      } catch (error) {
        this.logger.error(
          `Disconnect listener failed for ${userId}`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  // Per instance: the account may still be connected elsewhere, so confirm with isUserOnline.
  onLastSocketClosed(listener: (userId: string) => void): void {
    this.goneListeners.add(listener);
  }

  getOnlineUserIds(): string[] {
    return [...this.onlineCounts.keys()];
  }

  // An adapter that cannot answer reports online, since callers tear state down on a "no".
  async isUserOnline(userId: string): Promise<boolean> {
    if (this.onlineCounts.has(userId)) {
      return true;
    }
    if (!this.server) {
      return false;
    }
    try {
      const sockets = await this.server.in(userRoom(userId)).fetchSockets();
      return sockets.length > 0;
    } catch (error) {
      this.logger.warn(
        `Presence lookup for ${userId} failed, assuming online: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return true;
    }
  }

  sendToUser(userId: string, event: string, payload?: unknown): void {
    this.emit(userRoom(userId), event, payload);
  }

  sendToChannel(channel: string, event: string, payload?: unknown): void {
    this.emit(channelRoom(channel), event, payload);
  }

  broadcast(event: string, payload?: unknown): void {
    if (!this.server) {
      this.logger.warn(`Dropped broadcast "${event}" - gateway not initialized yet.`);
      return;
    }
    this.server.emit(event, payload);
  }

  private emit(room: string, event: string, payload?: unknown): void {
    if (!this.server) {
      this.logger.warn(
        `Dropped "${event}" to "${room}" - gateway not initialized yet.`,
      );
      return;
    }
    this.server.to(room).emit(event, payload);
    if (EMIT_LOGS) {
      // adapter.rooms is this instance's only; 0 local members means delivery relied on the Redis adapter.
      const local = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
      this.logger.log(
        `emit "${event}" -> ${room} | local sockets: ${local} | adapter: ${adapterState.mode} | instance: ${INSTANCE_ID}`,
      );
    }
  }
}
