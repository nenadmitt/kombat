import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { GameRoomSummary } from '@gaming-platform/core';

import { ISecurityContext } from '../authentication/authentication.types';
import { SecurityContext } from '../authentication/decorators/security-context.decorator';
import { JwtTokenGuard } from '../authentication/guards/jwt-token.guard';
import { CreateGameRoomDto } from './dto/create-game-room.dto';
import { ListGameRoomsDto } from './dto/list-game-rooms.dto';
import { GamesService } from './games.service';

@Controller('games/rooms')
@UseGuards(JwtTokenGuard)
export class GamesController {
  constructor(private readonly gamesService: GamesService) {}

  @Post()
  async createRoom(
    @Body() dto: CreateGameRoomDto,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<GameRoomSummary> {
    return this.gamesService.createRoom(securityContext.userId, dto.gameType);
  }

  @Post(':id/join')
  async joinRoom(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<GameRoomSummary> {
    return this.gamesService.joinRoom(securityContext.userId, id);
  }

  @Delete(':id')
  async closeRoom(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<{ success: true }> {
    await this.gamesService.closeRoom(securityContext.userId, id);
    return { success: true };
  }

  /** Pending rooms, visible to any authenticated user (joining comes later). */
  @Get()
  async listPendingRooms(
    @Query() query: ListGameRoomsDto,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<GameRoomSummary[]> {
    return this.gamesService.listPendingRooms(
      query.excludeOwn ? securityContext.userId : undefined,
    );
  }

  /** The requesting user's own open room, if any — lets the client resume a "waiting" state on app start. */
  @Get('mine')
  async getMyRoom(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<GameRoomSummary | null> {
    return this.gamesService.getMyActiveRoom(securityContext.userId);
  }
}
