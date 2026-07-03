import { Logger, UsePipes, ValidationPipe } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';

import { ChannelDto } from './dto/channel.dto';
import { channelRoom, userRoom } from './rooms.util';
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
export class WebsocketsGateway implements OnGatewayInit, OnGatewayConnection {
  private readonly logger = new Logger(WebsocketsGateway.name);

  @WebSocketServer()
  private readonly server: Server;

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
      client.disconnect(true);
      return;
    }

    try {
      const payload = await this.jwtService.verifyAsync<{ sub: string }>(
        token,
      );
      client.data.userId = payload.sub;
      await client.join(userRoom(payload.sub));
    } catch {
      client.disconnect(true);
    }
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
