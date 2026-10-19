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

import {
  CacheKeys,
  CacheService,
  CHAT_TTL_SECONDS,
} from '../cache';
import { DbService } from '../db';
import { INSTANCE_ID } from '../instance-id';
import { adapterState } from './redis-io.adapter';
import { participantsOf } from '../games/room.util';
import { ChannelDto } from './dto/channel.dto';
import { GameMessageDto } from './dto/game-message.dto';
import {
  channelRoom,
  gameChannel,
  gameChannelRoomId,
  userRoom,
} from './rooms.util';
import { WebsocketsService } from './websockets.service';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface SocketData {
  userId: string;
}

type AuthenticatedSocket = Socket<
  Record<string, unknown>,
  Record<string, unknown>,
  Record<string, unknown>,
  SocketData
>;

@WebSocketGateway({ cors: true })
export class WebsocketsGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(WebsocketsGateway.name);

  @WebSocketServer()
  private readonly server: Server;

  constructor(
    private readonly jwtService: JwtService,
    private readonly websocketsService: WebsocketsService,
    private readonly cacheService: CacheService,
    private readonly dbService: DbService,
  ) {}

  afterInit(server: Server): void {
    this.websocketsService.setServer(server);
    this.logger.log(
      `gateway ready on instance ${INSTANCE_ID} | adapter: ${adapterState.mode}`,
    );
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
      // `except`, not call order: under the Redis adapter the disconnect applies after the new socket has joined.
      this.server
        .in(userRoom(payload.sub))
        .except(client.id)
        .disconnectSockets(true);
      await client.join(userRoom(payload.sub));
      this.websocketsService.markConnected(payload.sub);
      this.logger.log(
        `User ${payload.sub} connected (socket ${client.id}) on instance ${INSTANCE_ID} | online here: ${this.websocketsService.getOnlineUserIds().length}`,
      );
    } catch {
      this.logger.warn(
        `Rejected socket ${client.id}: invalid or expired token`,
      );
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthenticatedSocket): void {
    const userId = client.data.userId;
    if (userId) {
      this.websocketsService.markDisconnected(userId);
    }
    this.logger.log(
      userId
        ? `User ${userId} disconnected (socket ${client.id})`
        : `Socket ${client.id} disconnected (never authenticated)`,
    );
  }

  // A refusal also emits channel:error for clients that fire-and-forget.
  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage('channel:join')
  async handleJoinChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() { channel }: ChannelDto,
  ): Promise<{ ok: boolean; channel: string }> {
    if (!(await this.mayJoin(client, channel))) {
      if (client.data.userId) {
        this.websocketsService.sendToUser(client.data.userId, 'channel:error', {
          channel,
          message: 'You are not allowed to join this channel.',
        });
      }
      return { ok: false, channel };
    }
    await client.join(channelRoom(channel));
    return { ok: true, channel };
  }

  // The channel name is client-supplied, so only seated players may subscribe to a game channel.
  private async mayJoin(
    client: AuthenticatedSocket,
    channel: string,
  ): Promise<boolean> {
    const userId = client.data.userId;
    if (!userId) {
      return false;
    }
    const roomId = gameChannelRoomId(channel);
    if (!roomId) {
      return true;
    }
    return this.isParticipant(roomId, userId);
  }

  private async isParticipant(
    roomId: string,
    userId: string,
  ): Promise<boolean> {
    // A malformed uuid would make Postgres throw rather than miss.
    if (!UUID_PATTERN.test(roomId)) {
      return false;
    }
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room || !participantsOf(room).includes(userId)) {
      this.logger.warn(
        `User ${userId} was refused access to game room ${roomId}`,
      );
      return false;
    }
    return true;
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage('channel:leave')
  async handleLeaveChannel(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() { channel }: ChannelDto,
  ): Promise<void> {
    await client.leave(channelRoom(channel));
  }

  @UsePipes(new ValidationPipe({ whitelist: true }))
  @SubscribeMessage('game:message')
  async handleGameMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() { roomId, text }: GameMessageDto,
  ): Promise<void> {
    const userId = client.data.userId;
    if (!userId || !(await this.isParticipant(roomId, userId))) {
      return;
    }
    // Unlocked read-append-write may drop a simultaneous message; acceptable for a placeholder chat.
    const key = CacheKeys.battleshipChat(roomId);
    const messages =
      (await this.cacheService.getJson<string[]>(key)) ?? [];
    messages.push(`${client.data.userId}: ${text}`);
    await this.cacheService.setJson(key, messages, CHAT_TTL_SECONDS);

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
