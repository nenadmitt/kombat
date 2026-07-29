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
  ChromaRoomState,
  GameRoomSummary,
  LudoRoomState,
  MatchHistoryEntry,
  RpsRoomState,
} from '@gaming-platform/core';

import { ISecurityContext } from '../authentication/authentication.types';
import { SecurityContext } from '../authentication/decorators/security-context.decorator';
import { JwtTokenGuard } from '../authentication/guards/jwt-token.guard';
import { DbService } from '../db';
import { GameType } from '../db/types/game';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { ChromaMatchService } from './chroma/chroma-match.service';
import { CreateGameRoomDto } from './dto/create-game-room.dto';
import { ListGameRoomsDto } from './dto/list-game-rooms.dto';
import { MatchHistoryQueryDto } from './dto/match-history-query.dto';
import { GamesService } from './games.service';
import { LudoMatchService } from './ludo/ludo-match.service';
import { participantsOf } from './room.util';
import { RpsMatchService } from './rps/rps-match.service';
import { StakesService } from './stakes/stakes.service';

@Controller('games/rooms')
@UseGuards(JwtTokenGuard)
export class GamesController {
  constructor(
    private readonly gamesService: GamesService,
    private readonly dbService: DbService,
    private readonly battleshipMatchService: BattleshipMatchService,
    private readonly chromaMatchService: ChromaMatchService,
    private readonly ludoMatchService: LudoMatchService,
    private readonly rpsMatchService: RpsMatchService,
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
      dto.isPrivate ?? false,
    );
  }

  /** Resolve a shareable invite code to a still-joinable room (private or public). */
  @Get('by-code/:code')
  async getRoomByCode(
    @Param('code') code: string,
  ): Promise<GameRoomSummary> {
    return this.gamesService.getRoomByCode(code);
  }

  /** Completed matches (result, stake, prize) — the History screen's feed. */
  @Get('history')
  async getHistory(
    @SecurityContext() securityContext: ISecurityContext,
    @Query() dto: MatchHistoryQueryDto,
  ): Promise<MatchHistoryEntry[]> {
    return this.gamesService.getHistory(
      securityContext.userId,
      dto.limit,
      dto.offset,
    );
  }

  @Post(':id/join')
  async joinRoom(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<GameRoomSummary> {
    return this.gamesService.joinRoom(securityContext.userId, id);
  }

  /** Creator-only early start for a multi-player (Ludo) room. */
  @Post(':id/start')
  async startRoom(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<GameRoomSummary> {
    return this.gamesService.startRoom(securityContext.userId, id);
  }

  /** A joiner backs out of a still-waiting multi-player (Ludo) room. */
  @Post(':id/leave')
  async leaveRoom(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<{ success: true }> {
    await this.gamesService.leaveRoom(securityContext.userId, id);
    return { success: true };
  }

  @Delete(':id')
  async closeRoom(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<{ success: true }> {
    await this.gamesService.closeRoom(securityContext.userId, id);
    return { success: true };
  }

  /** Forfeit an in-progress match — e.g. from the resume prompt. In Ludo the
   *  leaver is eliminated; the winner is set only once one player remains. */
  @Post(':id/forfeit')
  async forfeitRoom(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<{ winnerUserId: string | null }> {
    return this.gamesService.forfeitRoom(securityContext.userId, id);
  }

  /** Pending rooms, visible to any authenticated user (joining comes later). */
  @Get()
  async listPendingRooms(
    @Query() query: ListGameRoomsDto,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<GameRoomSummary[]> {
    return this.gamesService.listPendingRooms({
      excludeUserId: query.excludeOwn ? securityContext.userId : undefined,
      filters: {
        gameTypes: query.gameTypes,
        stake: query.stake,
        stakeTokens: query.stakeTokens,
      },
    });
  }

  /** The requesting user's own open room, if any — lets the client resume a "waiting" state on app start. */
  @Get('mine')
  async getMyRoom(
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<GameRoomSummary | null> {
    return this.gamesService.getMyActiveRoom(securityContext.userId);
  }

  /**
   * The requester's snapshot of a match — the mount/resume source of truth,
   * shaped per game type. Participants only; Battleship personalizes (the
   * opponent's fleet is revealed only as sunk ships), Ludo hides nothing.
   */
  @Get(':id/state')
  async getRoomState(
    @Param('id') id: string,
    @SecurityContext() securityContext: ISecurityContext,
  ): Promise<
    BattleshipRoomState | LudoRoomState | RpsRoomState | ChromaRoomState
  > {
    // Fresh read: this decides whether the match may start, and a stale
    // cached copy (possible on another instance when running without Redis)
    // would strand every player in the room on a loading spinner.
    const room = await this.dbService.findGameRoomByIdFresh(id);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }
    if (!participantsOf(room).includes(securityContext.userId)) {
      throw new ForbiddenException('You are not part of this room.');
    }
    if (room.gameType === GameType.Ludo) {
      await this.ludoMatchService.getOrCreate(room);
      return this.ludoMatchService.stateFor(id, securityContext.userId);
    }
    if (room.gameType === GameType.TripleCut) {
      await this.rpsMatchService.getOrCreate(room);
      return this.rpsMatchService.stateFor(id, securityContext.userId);
    }
    if (room.gameType === GameType.ChromaClash) {
      await this.chromaMatchService.getOrCreate(room);
      return this.chromaMatchService.stateFor(id, securityContext.userId);
    }
    await this.battleshipMatchService.getOrCreate(room);
    return this.battleshipMatchService.stateFor(id, securityContext.userId);
  }
}
