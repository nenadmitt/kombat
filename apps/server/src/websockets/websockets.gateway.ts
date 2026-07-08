import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { ChannelDto } from './dto/channel.dto';
import { GameMessageDto } from './dto/game-message.dto';
import { channelRoom, gameChannel, userRoom } from './rooms.util';
import { WebsocketsService } from './websockets.service';

interface SocketData {
  userId: string;
}

type AuthenticatedSocket = Socket<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  SocketData
>;

/**
 * Single gateway for all realtime traffic. Connections authenticate with the
 * same JWT used for HTTP, passed as `auth: { token }` in the socket.io
 * handshake (falls back to an `Authorization: Bearer` header). Unauthenticated
 * sockets are disconnected immediately rather than left connected.
 *
 * Every authenticated socket auto-joins a per-user room, so
 * WebsocketsService.sendToUser reaches all of that user's connections (e.g.
 * multiple devices). Channels are plain socket.io rooms that clients opt into
 * via `channel:join` / `channel:leave`.
 */
@WebSocketGateway({ cors: true })
export class WebsocketsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketsGateway.name);

  @WebSocketServer()
  private readonly server: Server;

  // Throwaway in-memory game state (message log per room) — not persisted,
  // lost on restart. Placeholder until real game state replaces it.
  private readonly gameMessages = new Map<string, string[]>();

  constructor(
    private readonly jwtService: JwtService,
    private readonly websocketsService: WebsocketsService,
  ) {}

  afterInit(server: Server): void {
    this.websocketsService.setServer(server);
  }

  async handleConnection(client: AuthenticatedSocket): Promise<void> {
    const token = this.extractToken(client);
    if (!token) {
      this.logger.warn(`Rejected socket ${client.id}: missing bearer token`);
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        token,
      );
      client.data.userId = payload.sub;
      await client.join(userRoom(payload.sub));
      this.logger.log(`User ${payload.sub} connected (socket ${client.id})`);
    } catch {
      this.logger.warn(
        `Rejected socket ${client.id}: invalid or expired token`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const userId = client.data.userId;
    this.logger.log(
      userId
        ? `User ${userId} disconnected (socket ${client.id})`
        : `Socket ${client.id} disconnected (never authenticated)`,
    );
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage('channel:join')
  async handleJoinChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() { channel }: ChannelDto,
  ): Promise<void> {
    await client.join(channelRoom(channel));
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage('channel:leave')
  async handleLeaveChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() { channel }: ChannelDto,
  ): Promise<void> {
    await client.leave(channelRoom(channel));
  }

  /**
   * Throwaway message relay for the placeholder Battleship screen — appends
   * to that room's in-memory log (attributed to the authenticated socket's
   * own userId, not anything client-supplied) and broadcasts the full,
   * updated log to everyone subscribed to the room's channel.
   */
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage('game:message')
  handleGameMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() { roomId, text }: GameMessageDto,
  ): void {
    const messages = this.gameMessages.get(roomId) ?? [];
    messages.push(`${client.data.userId}: ${text}`);
    this.gameMessages.set(roomId, messages);

    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      'game:message',
      messages,
    );
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.['token'];
    if (typeof authToken === 'string') {
      return authToken;
    }
    const [type, token] =
      client.handshake.headers.authorization?.split(' ') ?? [];
    return type === 'Bearer' ? token : undefined;
  }
}
