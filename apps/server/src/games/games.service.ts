import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BATTLESHIP_EVENTS,
  GameRoomSummary,
  MatchHistoryEntry,
  StakeAsset,
} from '@gaming-platform/core';

import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameRoomStatus, GameType } from '../db/types/game';
import { WebsocketsService } from '../websockets';
import { gameChannel } from '../websockets/rooms.util';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { getPlayerCountForGameType } from './game-type.util';
import { StakesService } from './stakes/stakes.service';

@Injectable()
export class GamesService {
  constructor(
    private readonly dbService: DbService,
    private readonly websocketsService: WebsocketsService,
    private readonly battleshipMatchService: BattleshipMatchService,
    private readonly stakesService: StakesService,
  ) {}

  async createRoom(
    userId: string,
    gameType: GameType,
    stake?: { token: StakeAsset; amount: string } | null,
  ): Promise<GameRoomSummary> {
    const existing = await this.dbService.findOpenGameRoomForUser(userId);
    if (existing) {
      throw new ConflictException(
        'You already have an active game room. Close it before creating another.',
      );
    }

    // Staked room: bounds + can the creator actually cover it? Nothing is
    // escrowed yet — stakes are pulled only when an opponent joins.
    if (stake) {
      this.stakesService.validateStake(stake.token, stake.amount);
      await this.stakesService.assertSufficientBalance(
        userId,
        stake.token,
        stake.amount,
      );
    }

    const room = await this.dbService.createGameRoom({
      userId,
      gameType,
      status: GameRoomStatus.Pending,
      playerCount: getPlayerCountForGameType(gameType),
      stakeToken: stake?.token ?? null,
      stakeAmount: stake?.amount ?? null,
    });

    return toGameRoomSummary(room);
  }

  /**
   * Closing removes the room entirely — a room that never started has
   * nothing worth keeping around. Only allowed while still Pending.
   */
  async closeRoom(userId: string, roomId: string): Promise<void> {
    const room = await this.dbService.findGameRoomForUser(roomId, userId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }

    if (room.status !== GameRoomStatus.Pending) {
      throw new ConflictException(
        'Only a room that has not started can be closed',
      );
    }

    await this.dbService.deleteGameRoom(roomId);
  }

  /**
   * Naval Battle is exactly 2 players, so joining immediately fills the room
   * and flips it to InProgress.
   *
   * Free rooms notify the creator right away (their app leaves "waiting" and
   * both transfer into the match). Staked rooms first escrow both stakes —
   * StakesService emits stake:funding now and stake:funded (plus the
   * creator's opponent-joined) once the pot is on-chain; the match start is
   * gated on that.
   */
  async joinRoom(userId: string, roomId: string): Promise<GameRoomSummary> {
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }

    if (room.userId === userId) {
      throw new ConflictException('You cannot join your own game room.');
    }

    if (room.status !== GameRoomStatus.Pending) {
      throw new ConflictException(
        'This room is no longer accepting players.',
      );
    }

    // Check the joiner's balance BEFORE flipping the room — a broke joiner
    // shouldn't take a pending room off the market.
    if (room.stakeToken !== null) {
      await this.stakesService.assertSufficientBalance(
        userId,
        room.stakeToken,
        room.stakeAmount!,
      );
    }

    await this.dbService.joinGameRoom(roomId, userId);
    const joined: GameRoomEntity = Object.assign(room, {
      opponentId: userId,
      status: GameRoomStatus.InProgress,
    });

    if (room.stakeToken !== null) {
      await this.stakesService.beginFunding(joined);
    } else {
      this.websocketsService.sendToUser(room.userId, 'game:opponent-joined', {
        roomId,
      });
    }

    return toGameRoomSummary(joined);
  }

  async listPendingRooms(excludeUserId?: string): Promise<GameRoomSummary[]> {
    const rooms = await this.dbService.findPendingGameRooms(excludeUserId);
    return rooms.map(toGameRoomSummary);
  }

  /**
   * The user's active (Pending/InProgress) room as either creator or opponent,
   * if any — used on app start to resume a "waiting" room or offer to rejoin an
   * in-progress match.
   */
  async getMyActiveRoom(userId: string): Promise<GameRoomSummary | null> {
    const room = await this.dbService.findActiveGameRoomForParticipant(userId);
    return room ? toGameRoomSummary(room) : null;
  }

  /** Completed matches for the History screen, newest first. */
  async getHistory(userId: string): Promise<MatchHistoryEntry[]> {
    const rooms = await this.dbService.findCompletedGameRoomsForUser(userId);
    const entries = await Promise.all(
      rooms.map(async room => {
        const opponentId =
          room.userId === userId ? room.opponentId : room.userId;
        const opponent = opponentId
          ? await this.dbService.findUserById(opponentId)
          : null;

        const isWinner = room.winnerUserId === userId;
        const isVoid = room.winnerUserId === null;
        const result = isVoid ? 'void' : isWinner ? 'win' : 'loss';

        let prizeDelta: string | null = null;
        if (room.stakeToken !== null && room.stakeAmount) {
          const stake = BigInt(room.stakeAmount);
          if (isVoid) {
            prizeDelta = '0';
          } else if (isWinner) {
            const escrow = await this.dbService.findStakeEscrowByRoomId(room.id);
            // payout − own stake; before settlement lands, estimate as stake.
            prizeDelta = escrow?.payout
              ? (BigInt(escrow.payout) - stake).toString()
              : stake.toString();
          } else {
            prizeDelta = (-stake).toString();
          }
        }

        return {
          roomId: room.id,
          gameType: room.gameType,
          opponentUsername: opponent?.username ?? null,
          result,
          stakeAmount: room.stakeAmount,
          stakeToken: room.stakeToken,
          prizeDelta,
          endReason: room.endReason,
          completedAt: (room.completedAt ?? room.createdAt).toISOString(),
        } satisfies MatchHistoryEntry;
      }),
    );
    return entries;
  }

  /**
   * Give up an in-progress match: the opponent wins. Unlike closeRoom (which
   * only deletes a not-yet-started room), this completes a live match so a
   * player can quit from the lobby without opening the game. A Pending room has
   * no match to forfeit — close it instead.
   */
  async forfeitRoom(
    userId: string,
    roomId: string,
  ): Promise<{ winnerUserId: string }> {
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }
    if (room.userId !== userId && room.opponentId !== userId) {
      throw new ForbiddenException('You are not part of this room.');
    }
    if (room.status !== GameRoomStatus.InProgress || !room.opponentId) {
      throw new ConflictException('Only an in-progress match can be forfeited.');
    }

    const opponentId =
      room.userId === userId ? room.opponentId : room.userId;

    // Update the cached match if it's still around; if it expired or never
    // existed, completing the DB room is enough to end it.
    try {
      await this.battleshipMatchService.forfeit(roomId, userId);
    } catch {
      // No live match — fall through to the completion below.
    }
    await this.stakesService.completeMatch(roomId, opponentId, 'forfeit');

    // Tell the channel so an opponent still in the match sees the win. (Any
    // scheduled turn deadline goes stale — the sweeper re-validates the phase
    // and drops it.)
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      BATTLESHIP_EVENTS.ended,
      { winnerUserId: opponentId, reason: 'forfeit' },
    );

    return { winnerUserId: opponentId };
  }
}

function toGameRoomSummary(room: GameRoomEntity): GameRoomSummary {
  return {
    id: room.id,
    gameType: room.gameType,
    status: room.status,
    playerCount: room.playerCount,
    stakeToken: room.stakeToken,
    stakeAmount: room.stakeAmount,
    createdAt: room.createdAt.toISOString(),
  };
}
