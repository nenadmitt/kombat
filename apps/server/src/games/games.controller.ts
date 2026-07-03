import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { GameRoomSummary } from '@gaming-platform/core';

import { ISecurityContext } from '../authentication/authentication.types';
import { SecurityContext } from '../authentication/decorators/security-context.decorator';
import { JwtTokenGuard } from '../authentication/guards/jwt-token.guard';
import { CreateGameRoomDto } from './dto/create-game-room.dto';
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
  async listPendingRooms(): Promise<GameRoomSummary[]> {
    return this.gamesService.listPendingRooms();
  }
}
