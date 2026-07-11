import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  BattleshipRoomState,
  GameRoomSummary,
  MatchHistoryEntry,
} from '@gaming-platform/core';

import { ISecurityContext } from '../authentication/authentication.types';
import { SecurityContext } from '../authentication/decorators/security-context.decorator';
import { JwtTokenGuard } from '../authentication/guards/jwt-token.guard';
import { DbService } from '../db';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { CreateGameRoomDto } from './dto/create-game-room.dto';
import { ListGameRoomsDto } from './dto/list-game-rooms.dto';
import { GamesService } from './games.service';
import { StakesService } from './stakes/stakes.service';

@Controller('games/rooms')
@UseGuards(JwtTokenGuard)
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly dbService: DbService,
    private readonly battleshipMatchService: BattleshipMatchService,
    private readonly stakesService: StakesService,
  ) {}

  @Post()
  async createRoom(
    @Body() dto: CreateGameRoomDto,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<GameRoomSummary> {
    return this.gamesService.createRoom(
      securityContext.userId,
      dto.gameType,
      dto.stakeToken !== undefined && dto.stakeAmount !== undefined
        ? { token: dto.stakeToken, amount: dto.stakeAmount }
        : null,
    );
  }

  /** Completed matches (result, stake, prize) — the History screen's feed. */
  @Get('history')
  async getHistory(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<MatchHistoryEntry[]> {
    return this.gamesService.getHistory(securityContext.userId);
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

  /** Forfeit an in-progress match (the opponent wins) — e.g. from the resume prompt. */
  @Post(':id/forfeit')
  async forfeitRoom(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<{ winnerUserId: string }> {
    return this.gamesService.forfeitRoom(securityContext.userId, id);
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

  /**
   * The requester's personalized snapshot of a match — the mount/resume source
   * of truth. Only the two participants may read it; the opponent's fleet is
   * revealed only as sunk ships.
   */
  @Get(':id/state')
  async getRoomState(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<BattleshipRoomState> {
    const room = await this.dbService.findGameRoomById(id);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }
    if (
      room.userId !== securityContext.userId &&
      room.opponentId !== securityContext.userId
    ) {
      throw new ForbiddenException('You are not part of this room.');
    }
    await this.battleshipMatchService.getOrCreate(room);
    return this.battleshipMatchService.stateFor(id, securityContext.userId);
  }
}
