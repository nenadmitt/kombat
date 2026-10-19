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
  players: [string, string];
  phase: 'play' | 'over';
  round: number;
  scores: Record<string, number>;
  // Hidden from the other player until both lock or the round times out.
  moves: Record<string, RpsMove | null>;
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  roundStartedAt: number | null;
  roundSeq: number;
  winnerUserId: string | null;
  endReason: RpsEndReason | null;
};

@Injectable()
export class RpsMatchService {
  constructor(private readonly cacheService: CacheService) {}

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

  timeoutRound(
    roomId: string,
    seq: number,
  ): Promise<{ reveal: RpsRevealPayload; over: boolean } | null> {
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
      // The timeout cap overrides score; both capped voids so no seat profits from a mutual no-show.
      const capped = match.players.filter(
        p => match.timeouts[p]! >= MAX_TIMEOUTS,
      );
      if (capped.length > 0 && match.phase === 'play') {
        const winner =
          capped.length === match.players.length
            ? null
            : this.opponentOf(match, capped[0]!);
        this.endMatch(match, winner, 'timeout');
        reveal.winnerUserId = winner;
        reveal.nextDeadline = null;
      }
      await this.persist(match);
      if (match.phase === 'play') {
        await this.scheduleRoundDeadline(match);
      }
      return { reveal, over: match.phase !== 'play' };
    });
  }

  forfeit(roomId: string, userId: string): Promise<{ winnerUserId: string }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      // Finished matches stay cached for the TTL; without this guard every replay would settle again.
      if (match.phase === 'over') {
        throw new ConflictException('The match is already over.');
      }
      const opponentId = this.opponentOf(match, userId);
      this.endMatch(match, opponentId, 'forfeit');
      await this.persist(match);
      return { winnerUserId: opponentId };
    });
  }

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

  // Mutates match; the caller overrides winner/deadline for timeout-cap handling.
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
    winnerUserId: string | null,
    reason: RpsEndReason,
  ): void {
    match.phase = 'over';
    match.winnerUserId = winnerUserId;
    match.endReason = reason;
  }

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
