import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_TIMEOUTS,
  resolveRound,
  RpsEndReason,
  RpsMove,
  RpsRevealPayload,
  RpsRoomState,
  TURN_SECONDS,
  WIN_TARGET,
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

export type RpsMatchState = {
  roomId: string;
  /** [creatorId, opponentId]. */
  players: [string, string];
  phase: 'play' | 'over';
  round: number;
  /** Round-win counts per user (first to WIN_TARGET wins the match). */
  scores: Record<string, number>;
  /** This round's locked moves (null until locked). Hidden cross-player until
   *  both are in or the round times out. */
  moves: Record<string, RpsMove | null>;
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  /** Epoch ms the current round's lock-in window started. */
  roundStartedAt: number | null;
  /** Bumped on every round (re)start; a stale deadline carries an old seq. */
  roundSeq: number;
  winnerUserId: string | null;
  endReason: RpsEndReason | null;
};

/**
 * Server-authoritative Triple Cut (RPS) match state. Both players lock a
 * secret move each round; the server reveals only once both are in (or the
 * round deadline forces it), scores the round, and starts the next - all
 * under a per-room lock, same as Battleship/Ludo. A player's move is never
 * broadcast before the reveal.
 */
@Injectable()
export class RpsMatchService {
  constructor(private readonly cacheService: CacheService) {}

  /** Fetch (or lazily create) the match for a filled, in-progress room. */
  getOrCreate(room: GameRoomEntity): Promise<RpsMatchState> {
    return this.locked(room.id, async () => {
      const existing = await this.load(room.id);
      if (existing) {
        return existing;
      }
      if (room.status !== GameRoomStatus.InProgress || !room.opponentId) {
        throw new ConflictException('The room has not started yet.');
      }
      const creator = room.userId;
      const opponent = room.opponentId;
      const match: RpsMatchState = {
        roomId: room.id,
        players: [creator, opponent],
        phase: 'play',
        round: 1,
        scores: { [creator]: 0, [opponent]: 0 },
        moves: { [creator]: null, [opponent]: null },
        timeouts: { [creator]: 0, [opponent]: 0 },
        online: { [creator]: false, [opponent]: false },
        roundStartedAt: Date.now(),
        roundSeq: 1,
        winnerUserId: null,
        endReason: null,
      };
      await this.persist(match);
      await this.scheduleRoundDeadline(match);
      return match;
    });
  }

  /**
   * Lock in a move for the current round. Returns whether both players are now
   * locked plus (when they are) the reveal payload to broadcast.
   */
  lock(
    roomId: string,
    userId: string,
    move: RpsMove,
  ): Promise<{ bothLocked: boolean; reveal: RpsRevealPayload | null }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      if (match.phase !== 'play') {
        throw new ConflictException('The match is not in play.');
      }
      if (match.moves[userId]) {
        throw new ConflictException('You already locked in this round.');
      }
      match.moves[userId] = move;

      const opponentId = this.opponentOf(match, userId);
      const bothLocked = Boolean(match.moves[opponentId]);
      if (!bothLocked) {
        await this.persist(match);
        return { bothLocked: false, reveal: null };
      }
      const reveal = this.resolveRound(match);
      await this.persist(match);
      if (match.phase === 'play') {
        await this.scheduleRoundDeadline(match);
      }
      return { bothLocked: true, reveal };
    });
  }

  /**
   * The round's lock-in window ran out. Any player who never locked accrues a
   * timeout; on the MAX_TIMEOUTS-th they lose the match. Otherwise the round
   * resolves with whatever was locked (a no-show move counts as a loss).
   * `seq` guards staleness - a mismatch means the round already advanced.
   */
  timeoutRound(
    roomId: string,
    seq: number,
  ): Promise<RpsRevealPayload | null> {
    return this.locked(roomId, async () => {
      const match = await this.load(roomId);
      if (!match || match.phase !== 'play' || match.roundSeq !== seq) {
        return null;
      }
      for (const player of match.players) {
        if (!match.moves[player]) {
          match.timeouts[player]! += 1;
        }
      }
      const reveal = this.resolveRound(match);
      // A player who hit the timeout cap loses outright, overriding score.
      const capped = match.players.find(
        p => match.timeouts[p]! >= MAX_TIMEOUTS,
      );
      if (capped && match.phase === 'play') {
        const winner = this.opponentOf(match, capped);
        this.endMatch(match, winner, 'timeout');
        reveal.winnerUserId = winner;
        reveal.nextDeadline = null;
      }
      await this.persist(match);
      if (match.phase === 'play') {
        await this.scheduleRoundDeadline(match);
      }
      return reveal;
    });
  }

  /** A player leaves -> the opponent wins. Returns the winner. */
  forfeit(roomId: string, userId: string): Promise<{ winnerUserId: string }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      const opponentId = this.opponentOf(match, userId);
      this.endMatch(match, opponentId, 'forfeit');
      await this.persist(match);
      return { winnerUserId: opponentId };
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
      if (!match || !match.players.includes(userId)) {
        return false;
      }
      match.online[userId] = online;
      await this.persist(match);
      return true;
    });
  }

  /** Personalized snapshot: the requester sees only their own locked move. */
  async stateFor(roomId: string, userId: string): Promise<RpsRoomState> {
    const match = await this.require(roomId);
    this.assertParticipant(match, userId);
    const opponentId = this.opponentOf(match, userId);
    return {
      roomId,
      phase: match.phase,
      opponentUserId: opponentId,
      round: match.round,
      scores: { ...match.scores },
      myMove: match.moves[userId] ?? null,
      opponentLocked: Boolean(match.moves[opponentId]),
      timeouts: { ...match.timeouts },
      online: { ...match.online },
      roundDeadline: match.phase === 'play' ? this.deadline(match) : null,
      winnerUserId: match.winnerUserId,
      endReason: match.endReason,
    };
  }

  async remove(roomId: string): Promise<void> {
    await this.cacheService.del(CacheKeys.rpsMatch(roomId));
  }

  // --- round resolution --------------------------------------------------------

  /**
   * Score the current round from `match.moves`, advance (or end the match),
   * and reset for the next round. Mutates `match`; returns the reveal payload
   * (winner/deadline get overridden by timeout-cap handling in the caller).
   */
  private resolveRound(match: RpsMatchState): RpsRevealPayload {
    const [a, b] = match.players;
    const result = resolveRound(match.moves[a]!, match.moves[b]!);
    let roundWinnerUserId: string | null = null;
    if (result === 1) {
      roundWinnerUserId = a;
      match.scores[a]! += 1;
    } else if (result === -1) {
      roundWinnerUserId = b;
      match.scores[b]! += 1;
    }

    const revealMoves = { ...match.moves };
    const round = match.round;

    let winnerUserId: string | null = null;
    if (roundWinnerUserId && match.scores[roundWinnerUserId]! >= WIN_TARGET) {
      this.endMatch(match, roundWinnerUserId, 'complete');
      winnerUserId = roundWinnerUserId;
    } else {
      // Decisive round advances the counter; a tie replays the same round.
      if (roundWinnerUserId) {
        match.round += 1;
      }
      match.moves = { [a]: null, [b]: null };
      this.restartRoundClock(match);
    }

    return {
      round,
      moves: revealMoves,
      roundWinnerUserId,
      scores: { ...match.scores },
      timeouts: { ...match.timeouts },
      nextRound: match.round,
      nextDeadline: winnerUserId ? null : this.deadline(match),
      winnerUserId,
    };
  }

  private endMatch(
    match: RpsMatchState,
    winnerUserId: string,
    reason: RpsEndReason,
  ): void {
    match.phase = 'over';
    match.winnerUserId = winnerUserId;
    match.endReason = reason;
  }

  // --- cache plumbing ----------------------------------------------------------

  private locked<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    return this.cacheService.withLock(
      CacheKeys.rpsLock(roomId),
      MATCH_LOCK_TTL_MS,
      fn,
    );
  }

  private load(roomId: string): Promise<RpsMatchState | null> {
    return this.cacheService.getJson<RpsMatchState>(
      CacheKeys.rpsMatch(roomId),
    );
  }

  private persist(match: RpsMatchState): Promise<void> {
    return this.cacheService.setJson(
      CacheKeys.rpsMatch(match.roomId),
      match,
      MATCH_TTL_SECONDS,
    );
  }

  private restartRoundClock(match: RpsMatchState): void {
    match.roundStartedAt = Date.now();
    match.roundSeq += 1;
  }

  private scheduleRoundDeadline(match: RpsMatchState): Promise<void> {
    return this.cacheService.addDeadline(
      deadlineMember(match.roomId, 'rps-round', match.roundSeq),
      this.deadline(match),
    );
  }

  private deadline(match: RpsMatchState): number {
    return (match.roundStartedAt ?? Date.now()) + TURN_SECONDS * 1000;
  }

  private async require(roomId: string): Promise<RpsMatchState> {
    const match = await this.load(roomId);
    if (!match) {
      throw new NotFoundException('Match not found.');
    }
    return match;
  }

  private assertParticipant(match: RpsMatchState, userId: string): void {
    if (!match.players.includes(userId)) {
      throw new ForbiddenException('You are not part of this match.');
    }
  }

  private opponentOf(match: RpsMatchState, userId: string): string {
    return match.players[0] === userId ? match.players[1] : match.players[0];
  }
}
