import { randomInt } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  allTokensHome,
  applyMove,
  colorForSeat,
  DIE_SIDES,
  initialTokens,
  legalMoves,
  LUDO_MAX_PLAYERS,
  LudoColor,
  LudoEliminatedPayload,
  LudoEndReason,
  LudoMovedPayload,
  LudoPlayer,
  LudoRolledPayload,
  LudoRoomState,
  LudoStage,
  LudoTokens,
  LudoTurnTimeoutPayload,
  MAX_CONSECUTIVE_SIXES,
  MAX_TIMEOUTS,
  nextColorInPlay,
  resetTokensToBase,
  TURN_SECONDS,
} from '@gaming-platform/core';

import {
  CacheKeys,
  CacheService,
  deadlineMember,
  MATCH_LOCK_TTL_MS,
  MATCH_TTL_SECONDS,
} from '../../cache';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { GameRoomStatus } from '../../db/types/game';

export type LudoMatchState = {
  roomId: string;
  /** Seats in join order (creator first) — also the turn order. */
  players: LudoPlayer[];
  tokens: LudoTokens;
  phase: 'play' | 'over';
  turnUserId: string;
  stage: LudoStage;
  /** The die awaiting a token choice (stage 'move'), else null. */
  die: number | null;
  /** Consecutive sixes rolled by the current player this turn. */
  sixChain: number;
  /** Movable token indices for the pending die (stage 'move'). */
  movable: number[];
  eliminated: LudoColor[];
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  turnStartedAt: number | null;
  /** Bumped on every turn-clock restart; stale deadlines carry an old seq. */
  turnSeq: number;
  winnerUserId: string | null;
  endReason: LudoEndReason | null;
};

/**
 * Server-authoritative Ludo match state, cached and locked per room exactly
 * like Battleship's. The server owns the dice (crypto randomInt) - clients
 * only ever ask to roll or pick a token, and every mutation runs a
 * lock -> read -> mutate -> write cycle so the deadline sweeper and gateway
 * can't interleave.
 */
@Injectable()
export class LudoMatchService {
  constructor(private readonly cacheService: CacheService) {}

  /** Fetch (or lazily create) the match for a started room. */
  getOrCreate(room: GameRoomEntity): Promise<LudoMatchState> {
    return this.locked(room.id, async () => {
      const existing = await this.load(room.id);
      if (existing) {
        return existing;
      }
      if (room.status !== GameRoomStatus.InProgress) {
        throw new ConflictException('The room has not started yet.');
      }
      const userIds = [room.userId, ...room.opponentIds];
      if (userIds.length < 2 || userIds.length > LUDO_MAX_PLAYERS) {
        throw new ConflictException('The room has an invalid player count.');
      }
      const players: LudoPlayer[] = userIds.map((userId, seat) => ({
        userId,
        color: colorForSeat(seat),
      }));
      const match: LudoMatchState = {
        roomId: room.id,
        players,
        tokens: initialTokens(players.map(p => p.color)),
        phase: 'play',
        turnUserId: players[0]!.userId,
        stage: 'roll',
        die: null,
        sixChain: 0,
        movable: [],
        eliminated: [],
        timeouts: Object.fromEntries(userIds.map(id => [id, 0])),
        online: Object.fromEntries(userIds.map(id => [id, false])),
        turnStartedAt: Date.now(),
        turnSeq: 1,
        winnerUserId: null,
        endReason: null,
      };
      await this.persist(match);
      await this.scheduleTurnDeadline(match);
      return match;
    });
  }

  /** Roll the die for the current player and resolve what it allows. */
  roll(roomId: string, userId: string): Promise<LudoRolledPayload> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertTurn(match, userId, 'roll');

      const die = randomInt(1, DIE_SIDES + 1);
      const sixChain = die === DIE_SIDES ? match.sixChain + 1 : 0;
      const thirdSix = sixChain >= MAX_CONSECUTIVE_SIXES;
      const color = this.colorOf(match, userId);
      const movable = thirdSix ? [] : legalMoves(match.tokens, color, die);

      if (movable.length > 0) {
        match.stage = 'move';
        match.die = die;
        match.sixChain = sixChain;
        match.movable = movable;
      } else if (!thirdSix && die === DIE_SIDES) {
        // A six with nothing to move still grants the re-roll.
        match.stage = 'roll';
        match.die = null;
        match.sixChain = sixChain;
      } else {
        this.passTurn(match);
      }
      this.restartTurnClock(match);
      await this.persist(match);
      await this.scheduleTurnDeadline(match);

      return {
        byUserId: userId,
        die,
        sixChain,
        movableTokens: movable,
        thirdSix,
        stage: match.stage,
        nextTurnUserId: match.turnUserId,
        turnDeadline: this.deadline(match),
      };
    });
  }

  /** Move one of the roller's movable tokens by the pending die. */
  move(
    roomId: string,
    userId: string,
    tokenIndex: number,
  ): Promise<LudoMovedPayload> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertTurn(match, userId, 'move');
      if (!match.movable.includes(tokenIndex)) {
        throw new ConflictException('That token cannot move with this roll.');
      }

      const color = this.colorOf(match, userId);
      const die = match.die!;
      const result = applyMove(match.tokens, color, tokenIndex, die);
      match.tokens = result.tokens;
      match.die = null;
      match.movable = [];

      let winnerUserId: string | null = null;
      const extraRoll = die === DIE_SIDES;
      if (allTokensHome(match.tokens, color)) {
        match.phase = 'over';
        match.winnerUserId = userId;
        match.endReason = 'complete';
        winnerUserId = userId;
      } else if (extraRoll) {
        match.stage = 'roll';
      } else {
        this.passTurn(match);
      }
      if (!winnerUserId) {
        this.restartTurnClock(match);
      }
      await this.persist(match);
      if (!winnerUserId) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        byUserId: userId,
        color,
        tokenIndex,
        die,
        fromProgress: result.fromProgress,
        toProgress: result.toProgress,
        captures: result.captures,
        tokens: match.tokens,
        extraRoll: extraRoll && !winnerUserId,
        stage: match.stage,
        nextTurnUserId: match.turnUserId,
        turnDeadline: this.deadline(match),
        winnerUserId,
      };
    });
  }

  /**
   * The current turn ran out. The idle player accrues a timeout; on the
   * MAX_TIMEOUTS-th they are eliminated (tokens back to base). The match
   * ends when elimination leaves a single player standing. A seq mismatch
   * means the turn already advanced - nothing to enforce.
   */
  timeoutTurn(
    roomId: string,
    seq: number,
  ): Promise<LudoTurnTimeoutPayload | null> {
    return this.locked(roomId, async () => {
      const match = await this.load(roomId);
      if (!match || match.phase !== 'play' || match.turnSeq !== seq) {
        return null;
      }
      const timedOutUserId = match.turnUserId;
      match.timeouts[timedOutUserId] =
        (match.timeouts[timedOutUserId] ?? 0) + 1;

      let eliminatedColor: LudoColor | null = null;
      let winnerUserId: string | null = null;
      if (match.timeouts[timedOutUserId]! >= MAX_TIMEOUTS) {
        eliminatedColor = this.colorOf(match, timedOutUserId);
        winnerUserId = this.eliminate(match, timedOutUserId, 'timeout');
      }
      if (!winnerUserId) {
        this.passTurn(match);
        this.restartTurnClock(match);
      }
      await this.persist(match);
      if (!winnerUserId) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        timedOutUserId,
        timeouts: { ...match.timeouts },
        eliminatedColor,
        tokens: match.tokens,
        nextTurnUserId: match.turnUserId,
        turnDeadline: this.deadline(match),
        winnerUserId,
      };
    });
  }

  /** A player leaves mid-match: eliminated; last player standing wins. */
  forfeit(roomId: string, userId: string): Promise<LudoEliminatedPayload> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      if (match.phase !== 'play') {
        throw new ConflictException('The match is not in play.');
      }
      const color = this.colorOf(match, userId);
      if (match.eliminated.includes(color)) {
        throw new ConflictException('You are already out of this match.');
      }
      const wasTheirTurn = match.turnUserId === userId;
      const winnerUserId = this.eliminate(match, userId, 'forfeit');
      if (!winnerUserId && wasTheirTurn) {
        this.passTurn(match);
      }
      if (!winnerUserId) {
        this.restartTurnClock(match);
      }
      await this.persist(match);
      if (!winnerUserId) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        userId,
        color,
        tokens: match.tokens,
        nextTurnUserId: match.turnUserId,
        turnDeadline: this.deadline(match),
        winnerUserId,
      };
    });
  }

  /** Update a player's socket-connection state. Returns whether it's an active match. */
  setPresence(
    roomId: string,
    userId: string,
    online: boolean,
  ): Promise<boolean> {
    return this.locked(roomId, async () => {
      const match = await this.load(roomId);
      if (!match || !match.players.some(p => p.userId === userId)) {
        return false;
      }
      match.online[userId] = online;
      await this.persist(match);
      return true;
    });
  }

  /** Snapshot for REST resume - Ludo hides nothing, same for everyone. */
  async stateFor(roomId: string, userId: string): Promise<LudoRoomState> {
    const match = await this.require(roomId);
    this.assertParticipant(match, userId);
    return {
      roomId,
      phase: match.phase,
      players: match.players,
      tokens: match.tokens,
      turnUserId: match.phase === 'over' ? null : match.turnUserId,
      stage: match.stage,
      die: match.die,
      sixChain: match.sixChain,
      movableTokens: match.movable,
      eliminated: match.eliminated,
      timeouts: { ...match.timeouts },
      online: { ...match.online },
      winnerUserId: match.winnerUserId,
      endReason: match.endReason,
      turnDeadline: match.phase === 'play' ? this.deadline(match) : null,
    };
  }

  async remove(roomId: string): Promise<void> {
    await this.cacheService.del(CacheKeys.ludoMatch(roomId));
  }

  // --- cache plumbing ----------------------------------------------------------

  private locked<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    return this.cacheService.withLock(
      CacheKeys.ludoLock(roomId),
      MATCH_LOCK_TTL_MS,
      fn,
    );
  }

  private load(roomId: string): Promise<LudoMatchState | null> {
    return this.cacheService.getJson<LudoMatchState>(
      CacheKeys.ludoMatch(roomId),
    );
  }

  private persist(match: LudoMatchState): Promise<void> {
    return this.cacheService.setJson(
      CacheKeys.ludoMatch(match.roomId),
      match,
      MATCH_TTL_SECONDS,
    );
  }

  private restartTurnClock(match: LudoMatchState): void {
    match.turnStartedAt = Date.now();
    match.turnSeq += 1;
  }

  private scheduleTurnDeadline(match: LudoMatchState): Promise<void> {
    return this.cacheService.addDeadline(
      deadlineMember(match.roomId, 'ludo-turn', match.turnSeq),
      this.deadline(match),
    );
  }

  // --- match logic helpers -------------------------------------------------------

  private deadline(match: LudoMatchState): number {
    return (match.turnStartedAt ?? Date.now()) + TURN_SECONDS * 1000;
  }

  private async require(roomId: string): Promise<LudoMatchState> {
    const match = await this.load(roomId);
    if (!match) {
      throw new NotFoundException('Match not found.');
    }
    return match;
  }

  private assertParticipant(match: LudoMatchState, userId: string): void {
    if (!match.players.some(p => p.userId === userId)) {
      throw new ForbiddenException('You are not part of this match.');
    }
  }

  private assertTurn(
    match: LudoMatchState,
    userId: string,
    stage: LudoStage,
  ): void {
    this.assertParticipant(match, userId);
    if (match.phase !== 'play') {
      throw new ConflictException('The match is not in play.');
    }
    if (match.turnUserId !== userId) {
      throw new ConflictException('It is not your turn.');
    }
    if (match.stage !== stage) {
      throw new ConflictException(
        stage === 'roll' ? 'Pick a token to move first.' : 'Roll the die first.',
      );
    }
  }

  private colorOf(match: LudoMatchState, userId: string): LudoColor {
    return match.players.find(p => p.userId === userId)!.color;
  }

  /** Hand the turn to the next non-eliminated player, fresh roll stage. */
  private passTurn(match: LudoMatchState): void {
    const colors = match.players.map(p => p.color);
    const next = nextColorInPlay(
      colors,
      this.colorOf(match, match.turnUserId),
      match.eliminated,
    );
    match.turnUserId = match.players.find(p => p.color === next)!.userId;
    match.stage = 'roll';
    match.die = null;
    match.sixChain = 0;
    match.movable = [];
  }

  /**
   * Remove a player from play. Returns the winner's userId when this leaves
   * exactly one player standing (and ends the match), else null.
   */
  private eliminate(
    match: LudoMatchState,
    userId: string,
    reason: LudoEndReason,
  ): string | null {
    const color = this.colorOf(match, userId);
    match.eliminated = [...match.eliminated, color];
    match.tokens = resetTokensToBase(match.tokens, color);

    const standing = match.players.filter(
      p => !match.eliminated.includes(p.color),
    );
    if (standing.length === 1) {
      match.phase = 'over';
      match.winnerUserId = standing[0]!.userId;
      match.endReason = reason;
      match.turnUserId = standing[0]!.userId;
      return standing[0]!.userId;
    }
    return null;
  }
}
