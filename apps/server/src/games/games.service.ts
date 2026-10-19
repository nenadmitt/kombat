import { randomInt } from 'node:crypto';

import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BATTLESHIP_EVENTS,
  CHROMA_EVENTS,
  GameRoomSummary,
  LOBBY_CHANNEL,
  LOBBY_EVENTS,
  LobbyRoomFilters,
  LUDO_EVENTS,
  MatchHistoryEntry,
  ROOM_EVENTS,
  RPS_EVENTS,
  SALVO_EVENTS,
  StakeAsset,
  convertStakeAmount,
  supportsMultiplayerRoom,
} from '@gaming-platform/core';

import { DbService } from '../db';
import { GameRoomEntity } from '../db/entities/game-room.entity';
import { MatchSettlementEntity } from '../db/entities/match-settlement.entity';
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
import { SalvoMatchService } from './salvo/salvo-match.service';
import { resolveJoinToken, stakeAssetFor } from './stakes/stake-legs.util';
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
    private readonly salvoMatchService: SalvoMatchService,
    private readonly stakesService: StakesService,
  ) {}

  async createRoom(
    userId: string,
    gameType: GameType,
    stake?: { token: StakeAsset; amount: string } | null,
    isPrivate = false,
  ): Promise<GameRoomSummary> {
    await this.maintenanceService.assertNotInMaintenance();
    // DTO validation only checks enum membership, and some GameType values have no gateway.
    if (!supportsMultiplayerRoom(gameType)) {
      throw new BadRequestException(
        'That game is not available for online rooms yet.',
      );
    }
    // Any room they take part in, so a seated player cannot also host a second room.
    const existing =
      await this.dbService.findActiveGameRoomForParticipant(userId);
    if (existing) {
      throw new ConflictException(
        'You already have an active game room. Close it before creating another.',
      );
    }

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

    this.emitLobbyAdded(room);
    return toGameRoomSummary(room);
  }

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

  private async generateUniqueRoomCode(): Promise<string> {
    for (let attempt = 0; attempt < 8; attempt++) {
      const code = generateRoomCode();
      if (!(await this.dbService.findGameRoomByCode(code))) {
        return code;
      }
    }
    throw new ConflictException('Could not allocate a room code, try again.');
  }

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
    this.emitLobbyRemoved(room);
  }

  async joinRoom(
    userId: string,
    roomId: string,
    stakeToken?: StakeAsset,
  ): Promise<GameRoomSummary> {
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

    const prior =
      await this.dbService.findActiveGameRoomForParticipant(userId);
    if (prior && prior.id !== roomId && prior.status !== GameRoomStatus.Pending) {
      throw new ConflictException(
        'Finish or forfeit your current match before joining another.',
      );
    }

    const joinToken = resolveJoinToken(room, stakeToken);

    // Before flipping the room, so a broke joiner does not take it off the market.
    if (room.stakeToken !== null && joinToken !== null) {
      await this.stakesService.assertSufficientBalance(
        userId,
        joinToken,
        convertStakeAmount(room.stakeAmount!, room.stakeToken, joinToken),
      );
    }

    // Null for a same-token leg keeps single-asset rooms on the legacy read paths.
    const chosen = joinToken !== room.stakeToken ? joinToken : null;

    if (isMultiSeatGame(room.gameType)) {
      const seat = await this.joinMultiSeatRoom(userId, room, chosen);
      await this.releaseOwnRoom(userId, roomId);
      return seat;
    }

    // Conditional update: 0 rows if another joiner won the race since the Pending check.
    const seated = await this.dbService.joinGameRoom(roomId, userId, chosen);
    if (!seated) {
      throw new ConflictException('This room is no longer accepting players.');
    }
    const joined: GameRoomEntity = Object.assign(room, {
      opponentId: userId,
      status: GameRoomStatus.InProgress,
      ...(chosen !== null
        ? {
            stakeTokenChoices: {
              ...(room.stakeTokenChoices ?? {}),
              [userId]: chosen,
            },
          }
        : {}),
    });
    await this.releaseOwnRoom(userId, roomId);

    // Creator before the lobby delta: a client tracking its room via the lobby list would miss this.
    if (room.stakeToken !== null) {
      await this.stakesService.beginFunding(joined);
    } else {
      this.websocketsService.sendToUser(
        room.userId,
        ROOM_EVENTS.opponentJoined,
        { roomId },
      );
    }
    this.emitLobbyRemoved(joined);

    return toGameRoomSummary(joined);
  }

  private async releaseOwnRoom(
    userId: string,
    joinedRoomId: string,
  ): Promise<void> {
    const prior =
      await this.dbService.findActiveGameRoomForParticipant(userId);
    if (!prior || prior.id === joinedRoomId) return;
    if (prior.status !== GameRoomStatus.Pending) return;

    if (prior.userId === userId) {
      await this.dbService.deleteGameRoom(prior.id);
      this.emitLobbyRemoved(prior);
      return;
    }
    await this.vacateSeat(userId, prior.id);
  }

  private async vacateSeat(userId: string, roomId: string): Promise<void> {
    if (!(await this.dbService.removeGameRoomOpponent(roomId, userId))) return;
    const updated = await this.dbService.findGameRoomById(roomId);
    if (!updated) return;
    const joinedCount = participantsOf(updated).length;
    for (const participant of participantsOf(updated)) {
      this.websocketsService.sendToUser(participant, ROOM_EVENTS.playerLeft, {
        roomId,
        userId,
        joinedCount,
        playerCount: updated.playerCount,
      });
    }
    this.emitLobbyUpdated(updated);
  }

  private async joinMultiSeatRoom(
    userId: string,
    room: GameRoomEntity,
    stakeToken: StakeAsset | null,
  ): Promise<GameRoomSummary> {
    const appended = await this.dbService.appendGameRoomOpponent(
      room.id,
      userId,
      stakeToken,
    );
    if (!appended) {
      throw new ConflictException('This room is no longer accepting players.');
    }
    // Fresh read: this roster decides whether the match starts and what each seat funds in.
    const updated = await this.dbService.findGameRoomByIdFresh(room.id);
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
    } else {
      this.emitLobbyUpdated(updated);
    }
    return toGameRoomSummary(updated);
  }

  async startRoom(userId: string, roomId: string): Promise<GameRoomSummary> {
    await this.maintenanceService.assertNotInMaintenance();
    // Fresh read: the start decision must not come from a stale copy.
    const room = await this.dbService.findGameRoomByIdFresh(roomId);
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

  async leaveRoom(userId: string, roomId: string): Promise<void> {
    const room = await this.dbService.findGameRoomById(roomId);
    if (!room) {
      throw new NotFoundException('Game room not found');
    }
    if (!isMultiSeatGame(room.gameType) || room.userId === userId) {
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
      this.emitLobbyUpdated(updated);
    }
  }

  private async startMultiSeatMatch(room: GameRoomEntity): Promise<void> {
    const flipped = await this.dbService.startGameRoom(room.id);
    if (!flipped) {
      return;
    }
    const started: GameRoomEntity = Object.assign(room, {
      status: GameRoomStatus.InProgress,
    });
    if (started.stakeToken !== null) {
      await this.stakesService.beginFunding(started);
      this.emitLobbyRemoved(started);
      return;
    }
    for (const participant of participantsOf(started)) {
      this.websocketsService.sendToUser(participant, ROOM_EVENTS.started, {
        roomId: room.id,
      });
    }
    this.emitLobbyRemoved(started);
  }

  private emitLobbyAdded(room: GameRoomEntity): void {
    if (room.isPrivate) return;
    this.websocketsService.sendToChannel(
      LOBBY_CHANNEL,
      LOBBY_EVENTS.roomAdded,
      toGameRoomSummary(room),
    );
  }

  private emitLobbyUpdated(room: GameRoomEntity): void {
    if (room.isPrivate) return;
    this.websocketsService.sendToChannel(
      LOBBY_CHANNEL,
      LOBBY_EVENTS.roomUpdated,
      toGameRoomSummary(room),
    );
  }

  private emitLobbyRemoved(room: GameRoomEntity): void {
    if (room.isPrivate) return;
    this.websocketsService.sendToChannel(LOBBY_CHANNEL, LOBBY_EVENTS.roomRemoved, {
      roomId: room.id,
    });
  }

  async listPendingRooms(options?: {
    excludeUserId?: string;
    filters?: LobbyRoomFilters;
  }): Promise<GameRoomSummary[]> {
    const rooms = await this.dbService.findPendingGameRooms({
      excludeUserId: options?.excludeUserId,
      gameTypes: options?.filters?.gameTypes,
      stake: options?.filters?.stake,
      stakeTokens: options?.filters?.stakeTokens,
    });
    return rooms.map(toGameRoomSummary);
  }

  async getMyActiveRoom(userId: string): Promise<GameRoomSummary | null> {
    const room = await this.dbService.findActiveGameRoomForParticipant(userId);
    return room ? toGameRoomSummary(room) : null;
  }

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
        const opponentIds = participantsOf(room).filter(id => id !== userId);
        const opponents = await Promise.all(
          opponentIds.map(id => this.dbService.findUserById(id)),
        );
        const opponentUsernames = opponents
          .map(o => o?.username)
          .filter((name): name is string => Boolean(name));

        const isWinner = room.winnerUserId === userId;
        const isVoid = room.winnerUserId === null;
        const result = isVoid ? 'void' : isWinner ? 'win' : 'loss';

        // Priced in the viewer's own staked token: rooms can mix stablecoins with different decimals.
        let stakeToken = room.stakeToken;
        let stakeAmount = room.stakeAmount;
        let prizeDelta: string | null = null;
        if (room.stakeToken !== null && room.stakeAmount) {
          const own = stakeAssetFor(room, userId);
          const stake = BigInt(
            convertStakeAmount(room.stakeAmount, room.stakeToken, own),
          );
          stakeToken = own;
          stakeAmount =
            own === room.stakeToken ? room.stakeAmount : stake.toString();
          if (isVoid) {
            prizeDelta = '0';
          } else if (isWinner) {
            const settlement = await this.dbService.findMatchSettlementByRoomId(room.id);
            const payout = settlement
              ? totalPayoutIn(settlement, room.stakeToken, own)
              : null;
            // Before settlement lands, estimate the delta as the stake.
            prizeDelta =
              payout === null
                ? stake.toString()
                : (payout - stake).toString();
          } else {
            prizeDelta = (-stake).toString();
          }
        }

        return {
          roomId: room.id,
          gameType: room.gameType,
          opponentUsername: opponentUsernames[0] ?? null,
          opponentUsernames,
          result,
          stakeAmount,
          stakeToken,
          prizeDelta,
          endReason: room.endReason,
          completedAt: (room.completedAt ?? room.createdAt).toISOString(),
        } satisfies MatchHistoryEntry;
      }),
    );
    return entries;
  }

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

    // Falling through would void a match the others are still playing.
    if ((room.eliminatedUserIds ?? []).includes(userId)) {
      throw new ConflictException('You are already out of this match.');
    }

    if (room.gameType === GameType.Ludo) {
      return this.forfeitLudoRoom(userId, room);
    }
    if (room.gameType === GameType.ChromaClash) {
      return this.forfeitChromaRoom(userId, room);
    }

    const opponentId =
      room.userId === userId ? room.opponentId! : room.userId;

    const isRps = room.gameType === GameType.TripleCut;
    const isSalvo = room.gameType === GameType.Salvo;
    try {
      if (isRps) {
        await this.rpsMatchService.forfeit(roomId, userId);
      } else if (isSalvo) {
        await this.salvoMatchService.forfeit(roomId, userId);
      } else {
        await this.battleshipMatchService.forfeit(roomId, userId);
      }
    } catch {
    }
    await this.stakesService.completeMatch(roomId, opponentId, 'forfeit');

    this.websocketsService.sendToChannel(
      gameChannel(roomId),
      isRps
        ? RPS_EVENTS.ended
        : isSalvo
          ? SALVO_EVENTS.ended
          : BATTLESHIP_EVENTS.ended,
      { winnerUserId: opponentId, reason: 'forfeit' },
    );

    return { winnerUserId: opponentId };
  }

  private async forfeitLudoRoom(
    userId: string,
    room: GameRoomEntity,
  ): Promise<{ winnerUserId: string | null }> {
    try {
      const payload = await this.ludoMatchService.forfeit(room.id, userId);
      await this.dbService.recordEliminatedUser(room.id, userId);
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
      await this.stakesService.completeMatch(room.id, null, 'forfeit');
      return { winnerUserId: null };
    }
  }

  private async forfeitChromaRoom(
    userId: string,
    room: GameRoomEntity,
  ): Promise<{ winnerUserId: string | null }> {
    try {
      const { payload } = await this.chromaMatchService.forfeit(
        room.id,
        userId,
      );
      await this.dbService.recordEliminatedUser(room.id, userId);
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
      await this.stakesService.completeMatch(room.id, null, 'forfeit');
      return { winnerUserId: null };
    }
  }
}

function totalPayoutIn(
  settlement: MatchSettlementEntity,
  roomToken: StakeAsset,
  viewerToken: StakeAsset,
): bigint | null {
  if (settlement.payoutByAsset) {
    return Object.entries(settlement.payoutByAsset).reduce(
      (total, [asset, amount]) =>
        total +
        BigInt(
          convertStakeAmount(amount, Number(asset) as StakeAsset, viewerToken),
        ),
      0n,
    );
  }
  if (settlement.payout) {
    return BigInt(convertStakeAmount(settlement.payout, roomToken, viewerToken));
  }
  return null;
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

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;

function generateRoomCode(): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    code += ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)];
  }
  return code;
}
