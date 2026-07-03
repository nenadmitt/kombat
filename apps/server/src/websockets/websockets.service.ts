import { Injectable, Logger } from '@nestjs/common';
import type { Server } from 'socket.io';

import { channelRoom, userRoom } from './rooms.util';

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

  setServer(server: Server): void {
    this.server = server;
  }

  /** Sends `event` to every socket the given user currently has connected. */
  sendToUser(userId: string, event: string, payload?: unknown): void {
    this.emit(userRoom(userId), event, payload);
  }

  /** Sends `event` to every socket currently subscribed to `channel`. */
  sendToChannel(channel: string, event: string, payload?: unknown): void {
    this.emit(channelRoom(channel), event, payload);
  }

  private emit(room: string, event: string, payload?: unknown): void {
    if (!this.server) {
      this.logger.warn(
        `Dropped "${event}" to "${room}" — gateway not initialized yet.`,
      );
      return;
    }
    this.server.to(room).emit(event, payload);
  }
}
