import { randomInt } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BATTLESHIP_EVENTS,
  CHROMA_EVENTS,
  GameRoomSummary,
  LUDO_EVENTS,
  MatchHistoryEntry,
  ROOM_EVENTS,
  RPS_EVENTS,
  StakeAsset,
} from '@gaming-platform/core';

import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { GameRoomStatus, GameType } from '../db/types/game';
import { WebsocketsService } from '../websockets';
import { gameChannel } from '../websockets/rooms.util';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { ChromaMatchService } from './chroma/chroma-match.service';
import {
  getPlayerCountForGameType,
  isMultiSeatGame,
  MULTI_SEAT_MIN_PLAYERS,
} from './game-type.util';
import { MaintenanceService } from '../maintenance';
import { LudoMatchService } from './ludo/ludo-match.service';
import { participantsOf } from './room.util';
import { RpsMatchService } from './rps/rps-match.service';
import { StakesService } from './stakes/stakes.service';

@Injectable()
export class GamesService {
  constructor(
    private readonly dbService: DbService,
    private readonly maintenanceService: MaintenanceService,
    private readonly websocketsService: WebsocketsService,
    private readonly battleshipMatchService: BattleshipMatchService,
    private readonly chromaMatchService: ChromaMatchService,
    private readonly ludoMatchService: LudoMatchService,
    private readonly rpsMatchService: RpsMatchService,
    private readonly stakesService: StakesService,
  ) {}

  async createRoom(
    userId: string,
    gameType: GameType,
    stake?: { token: StakeAsset; amount: string } | null,
    isPrivate = false,
  ): Promise<GameRoomSummary> {
    await this.maintenanceService.assertNotInMaintenance();
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
      code: await this.generateUniqueRoomCode(),
      isPrivate,
    });

    return toGameRoomSummary(room);
  }

  /** Resolve a shared invite code to a still-joinable (Pending) room. */
  async getRoomByCode(code: string): Promise<GameRoomSummary> {
    const normalized = code.trim().toUpperCase();
    const room = normalized
      ? await this.dbService.findPendingGameRoomByCode(normalized)
      : null;
    if (!room) {
      throw new NotFoundException(
        'No open room with that code. Check the code and try again.',
      );
    }
    return toGameRoomSummary(room);
  }

  /** A short unshoulder-surfable code, unique across live rooms (retry on clash). */
  private async generateUniqueRoomCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateRoomCode();
      if (!(await this.dbService.findGameRoomByCode(code))) {
        return code;
      }
    }
    // Astronomically unlikely with a 32^6 space; fail loudly rather than loop.
    throw new ConflictException('Could not allocate a room code, try again.');
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
    await this.maintenanceService.assertNotInMaintenance();
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

    if (isMultiSeatGame(room.gameType)) {
      return this.joinMultiSeatRoom(userId, room);
    }

    // Conditional seat-taking: if another joiner won the race between the
    // Pending check above and here, this affects 0 rows and we bail out
    // rather than overwriting their seat.
    const seated = await this.dbService.joinGameRoom(roomId, userId);
    if (!seated) {
      throw new ConflictException('This room is no longer accepting players.');
    }
    const joined: GameRoomEntity = Object.assign(room, {
      opponentId: userId,
      status: GameRoomStatus.InProgress,
    });

    if (room.stakeToken !== null) {
      await this.stakesService.beginFunding(joined);
    } else {
      this.websocketsService.sendToUser(
        room.userId,
        ROOM_EVENTS.opponentJoined,
        { roomId },
      );
    }

    return toGameRoomSummary(joined);
  }

  /**
   * A multi-seat room (Ludo, ChromaClash) accumulates joiners without
   * starting: the appended join is atomic (capacity/duplicate enforced in
   * SQL), everyone already in gets a roster update, and the match starts
   * only when the room fills - or when the creator starts early via
   * startRoom.
   */
  private async joinMultiSeatRoom(
    userId: string,
    room: GameRoomEntity,
  ): Promise<GameRoomSummary> {
    const appended = await this.dbService.appendGameRoomOpponent(
      room.id,
      userId,
    );
    if (!appended) {
      throw new ConflictException('This room is no longer accepting players.');
    }
    const updated = await this.dbService.findGameRoomById(room.id);
    if (!updated) {
      throw new NotFoundException('Game room not found');
    }

    const joinedCount = participantsOf(updated).length;
    for (const participant of participantsOf(updated)) {
      if (participant !== userId) {
        this.websocketsService.sendToUser(
          participant,
          ROOM_EVENTS.playerJoined,
          {
            roomId: room.id,
            userId,
            joinedCount,
            playerCount: updated.playerCount,
          },
        );
      }
    }

    if (joinedCount >= updated.playerCount) {
      await this.startMultiSeatMatch(updated);
    }
    return toGameRoomSummary(updated);
  }

  /**
   * Creator-triggered early start for a multi-seat room (Ludo, ChromaClash):
   * allowed once at least MULTI_SEAT_MIN_PLAYERS have joined.
   */
  async startRoom(userId: string, roomId: string): Promise<GameRoomSummary> {
    await this.maintenanceService.assertNotInMaintenance();
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }
    if (!isMultiSeatGame(room.gameType)) {
      throw new ConflictException('This game starts when the room is full.');
    }
    if (room.userId !== userId) {
      throw new ForbiddenException('Only the room creator can start early.');
    }
    if (room.status !== GameRoomStatus.Pending) {
      throw new ConflictException('The room has already started.');
    }
    if (participantsOf(room).length < MULTI_SEAT_MIN_PLAYERS) {
      throw new ConflictException(
        'At least one other player must join before starting.',
      );
    }
    await this.startMultiSeatMatch(room);
    const started = await this.dbService.findGameRoomById(roomId);
    return toGameRoomSummary(started ?? room);
  }

  /** A joiner backs out of a still-waiting multi-seat room. */
  async leaveRoom(userId: string, roomId: string): Promise<void> {
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }
    if (!isMultiSeatGame(room.gameType) || room.userId === userId) {
      // The creator closes the room instead of leaving it.
      throw new ConflictException('You cannot leave this room.');
    }
    const removed = await this.dbService.removeGameRoomOpponent(
      roomId,
      userId,
    );
    if (!removed) {
      throw new ConflictException('The room has already started.');
    }
    const updated = await this.dbService.findGameRoomById(roomId);
    if (updated) {
      const joinedCount = participantsOf(updated).length;
      for (const participant of participantsOf(updated)) {
        this.websocketsService.sendToUser(
          participant,
          ROOM_EVENTS.playerLeft,
          {
            roomId,
            userId,
            joinedCount,
            playerCount: updated.playerCount,
          },
        );
      }
    }
  }

  /**
   * Flip a multi-seat room to InProgress exactly once and kick the match
   * off. Free rooms notify every participant immediately; staked rooms first
   * escrow every player's stake - StakesService emits stake:funding now and
   * (once the pot is on-chain) stake:funded plus the started event.
   */
  private async startMultiSeatMatch(room: GameRoomEntity): Promise<void> {
    const flipped = await this.dbService.startGameRoom(room.id);
    if (!flipped) {
      return; // Lost a race with another start - the winner handles kickoff.
    }
    const started: GameRoomEntity = Object.assign(room, {
      status: GameRoomStatus.InProgress,
    });
    if (started.stakeToken !== null) {
      await this.stakesService.beginFunding(started);
      return;
    }
    for (const participant of participantsOf(started)) {
      this.websocketsService.sendToUser(participant, ROOM_EVENTS.started, {
        roomId: room.id,
      });
    }
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

  /** Completed matches for the History screen, newest first (paginated). */
  async getHistory(
    userId: string,
    limit = 10,
    offset = 0,
  ): Promise<MatchHistoryEntry[]> {
    const rooms = await this.dbService.findCompletedGameRoomsForUser(
      userId,
      limit,
      offset,
    );
    const entries = await Promise.all(
      rooms.map(async room => {
        // Multi-player rooms have several opponents; History names the first.
        const opponentId =
          participantsOf(room).find(id => id !== userId) ?? null;
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
  ): Promise<{ winnerUserId: string | null }> {
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }
    if (!participantsOf(room).includes(userId)) {
      throw new ForbiddenException('You are not part of this room.');
    }
    if (
      room.status !== GameRoomStatus.InProgress ||
      participantsOf(room).length < 2
    ) {
      throw new ConflictException('Only an in-progress match can be forfeited.');
    }

    if (room.gameType === GameType.Ludo) {
      return this.forfeitLudoRoom(userId, room);
    }
    if (room.gameType === GameType.ChromaClash) {
      return this.forfeitChromaRoom(userId, room);
    }

    const opponentId =
      room.userId === userId ? room.opponentId! : room.userId;

    // Update the cached match if it's still around; if it expired or never
    // existed, completing the DB room is enough to end it. Each 2-player game
    // ends its own live match state and announces on its own channel event.
    const isRps = room.gameType === GameType.TripleCut;
    try {
      if (isRps) {
        await this.rpsMatchService.forfeit(roomId, userId);
      } else {
        await this.battleshipMatchService.forfeit(roomId, userId);
      }
    } catch {
      // No live match — fall through to the completion below.
    }
    await this.stakesService.completeMatch(roomId, opponentId, 'forfeit');

    // Tell the channel so an opponent still in the match sees the win. (Any
    // scheduled deadline goes stale — the sweeper re-validates the phase and
    // drops it.)
    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      isRps ? RPS_EVENTS.ended : BATTLESHIP_EVENTS.ended,
      { winnerUserId: opponentId, reason: 'forfeit' },
    );

    return { winnerUserId: opponentId };
  }

  /**
   * A Ludo forfeit eliminates the leaver; the match only completes when one
   * player is left standing (2-player rooms complete immediately). If the
   * cached match is gone (expired), the room is voided instead - with more
   * than two players there is no "the other one wins" shortcut.
   */
  private async forfeitLudoRoom(
    userId: string,
    room: GameRoomEntity,
  ): Promise<{ winnerUserId: string | null }> {
    try {
      const payload = await this.ludoMatchService.forfeit(room.id, userId);
      this.websocketsService.sendToChannel(
        gameChannel(room.id),
        LUDO_EVENTS.eliminated,
        payload,
      );
      if (payload.winnerUserId) {
        this.websocketsService.sendToChannel(
          gameChannel(room.id),
          LUDO_EVENTS.ended,
          { winnerUserId: payload.winnerUserId, reason: 'forfeit' },
        );
        await this.stakesService.completeMatch(
          room.id,
          payload.winnerUserId,
          'forfeit',
        );
      }
      return { winnerUserId: payload.winnerUserId };
    } catch {
      // No live match state - void the room so stakes come back.
      await this.stakesService.completeMatch(room.id, null, 'forfeit');
      return { winnerUserId: null };
    }
  }

  /** Chroma forfeit: same elimination semantics as Ludo's. */
  private async forfeitChromaRoom(
    userId: string,
    room: GameRoomEntity,
  ): Promise<{ winnerUserId: string | null }> {
    try {
      const { payload } = await this.chromaMatchService.forfeit(
        room.id,
        userId,
      );
      this.websocketsService.sendToChannel(
        gameChannel(room.id),
        CHROMA_EVENTS.eliminated,
        payload,
      );
      if (payload.winnerUserId) {
        this.websocketsService.sendToChannel(
          gameChannel(room.id),
          CHROMA_EVENTS.ended,
          { winnerUserId: payload.winnerUserId, reason: 'forfeit' },
        );
        await this.stakesService.completeMatch(
          room.id,
          payload.winnerUserId,
          'forfeit',
        );
      }
      return { winnerUserId: payload.winnerUserId };
    } catch {
      // No live match state - void the room so stakes come back.
      await this.stakesService.completeMatch(room.id, null, 'forfeit');
      return { winnerUserId: null };
    }
  }
}

function toGameRoomSummary(room: GameRoomEntity): GameRoomSummary {
  return {
    id: room.id,
    gameType: room.gameType,
    status: room.status,
    playerCount: room.playerCount,
    joinedCount: participantsOf(room).length,
    creatorUserId: room.userId,
    stakeToken: room.stakeToken,
    stakeAmount: room.stakeAmount,
    code: room.code,
    isPrivate: room.isPrivate,
    createdAt: room.createdAt.toISOString(),
  };
}

/** Uppercase, unambiguous alphabet (no I/O/0/1) so codes are easy to read/type. */
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
