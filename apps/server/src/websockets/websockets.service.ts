import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

import { INSTANCE_ID } from '../instance-id';
import { adapterState } from './redis-io.adapter';
import { channelRoom, userRoom } from './rooms.util';

/** Per-emit logging; set WS_EMIT_LOGS=false to silence once diagnosed. */
const EMIT_LOGS = process.env.WS_EMIT_LOGS !== 'false';

/**
 * Sends data to connected sockets. The gateway hands over its `Server`
 * instance from `afterInit`; any send before that (should never happen in
 * practice — the gateway initializes at app boot) is logged and dropped
 * rather than throwing.
 */
@Injectable()
export class WebsocketsService {
  private readonly logger = new Logger(WebsocketsService.name);
  private server?: Server;
  /**
   * In-memory online presence: userId -> number of open sockets. The gateway
   * allows one socket per account, but replacement overlaps briefly with the
   * socket it kicks, so this stays a count rather than a set. Per-instance:
   * with the multi-instance Redis setup it reflects only this node's
   * connections (same single-instance caveat as the in-memory cache fallback).
   */
  private readonly onlineCounts = new Map<string, number>();

  setServer(server: Server): void {
    this.server = server;
  }

  /** Records a new socket for a user; call once per authenticated connection. */
  markConnected(userId: string): void {
    this.onlineCounts.set(userId, (this.onlineCounts.get(userId) ?? 0) + 1);
  }

  /** Drops one of a user's sockets; removes them once the last one closes. */
  markDisconnected(userId: string): void {
    const next = (this.onlineCounts.get(userId) ?? 0) - 1;
    if (next > 0) {
      this.onlineCounts.set(userId, next);
    } else {
      this.onlineCounts.delete(userId);
    }
  }

  /** The ids of users with at least one open socket on this instance. */
  getOnlineUserIds(): string[] {
    return [...this.onlineCounts.keys()];
  }

  /** Sends `event` to every socket the given user currently has connected. */
  sendToUser(userId: string, event: string, payload?: unknown): void {
    this.emit(userRoom(userId), event, payload);
  }

  /** Sends `event` to every socket currently subscribed to `channel`. */
  sendToChannel(channel: string, event: string, payload?: unknown): void {
    this.emit(channelRoom(channel), event, payload);
  }

  /** Sends `event` to every connected socket (all users; with the Redis
   *  adapter this fans out across instances). Platform-wide notices only. */
  broadcast(event: string, payload?: unknown): void {
    if (!this.server) {
      this.logger.warn(`Dropped broadcast "${event}" — gateway not initialized yet.`);
      return;
    }
    this.server.emit(event, payload);
  }

  private emit(room: string, event: string, payload?: unknown): void {
    if (!this.server) {
      this.logger.warn(
        `Dropped "${event}" to "${room}" — gateway not initialized yet.`,
      );
      return;
    }
    this.server.to(room).emit(event, payload);
    if (EMIT_LOGS) {
      // Room membership in `adapter.rooms` is this instance's only. 0 local
      // members means delivery depended entirely on the Redis adapter.
      const local = this.server.sockets.adapter.rooms.get(room)?.size ?? 0;
      this.logger.log(
        `emit "${event}" -> ${room} | local sockets: ${local} | adapter: ${adapterState.mode} | instance: ${INSTANCE_ID}`,
      );
    }
  }
}
