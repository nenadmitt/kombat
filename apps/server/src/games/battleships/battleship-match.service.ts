import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  BattleshipEndReason,
  BattleshipRoomState,
  FLEET,
  FireKind,
  FleetPlacements,
  isValidFleet,
  MAX_TIMEOUTS,
  POINTS_PER_HIT,
  POWERUP_COST,
  RevealedShip,
  resolveShot,
  SETUP_SECONDS,
  SHIP_BY_ID,
  Shot,
  ShotPayload,
  TURN_SECONDS,
  TurnTimeoutPayload,
  bombCells,
  sunkShipIds,
  torpedoCells,
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

export type MatchState = {
  roomId: string;
  /** [creatorId, opponentId] — the creator fires first. */
  players: [string, string];
  fleets: Record<string, FleetPlacements | null>;
  /** Shots FIRED BY each user (against the opponent). */
  shots: Record<string, Shot[]>;
  points: Record<string, number>;
  /** Accrued turn-timeout counts per user (MAX_TIMEOUTS → forfeit). */
  timeouts: Record<string, number>;
  /** Socket connection state per user (for the presence indicator). */
  online: Record<string, boolean>;
  phase: 'setup' | 'play' | 'over';
  turnUserId: string | null;
  /** Epoch ms the current turn started (for the countdown deadline). */
  turnStartedAt: number | null;
  /**
   * Bumped every time the turn clock (re)starts. Scheduled turn deadlines
   * carry the seq they were armed for, so a popped deadline for an old turn
   * is recognized as stale and dropped — the cache-side replacement for
   * clearTimeout.
   */
  turnSeq: number;
  /** Epoch ms fleet setup auto-forfeits (fixed at match creation). */
  setupDeadline: number;
  winnerUserId: string | null;
  /** Why the match ended (null while still in progress). */
  endReason: BattleshipEndReason | null;
};

/**
 * Server-authoritative Battleship match state, stored in the shared cache
 * (Redis when configured, in-process otherwise) so any instance can serve any
 * event and a restart doesn't lose matches. Every mutation runs a
 * lock → read → mutate → write cycle under the per-room lock; timeout
 * enforcement re-validates phase/turnSeq under the same lock, which makes the
 * deadline sweeper idempotent and multi-instance-safe.
 */
@Injectable()
export class BattleshipMatchService {
  constructor(private readonly cacheService: CacheService) {}

  /** Fetch (or lazily create) the match for a filled, in-progress room. */
  getOrCreate(room: GameRoomEntity): Promise<MatchState> {
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
      const match: MatchState = {
        roomId: room.id,
        players: [creator, opponent],
        fleets: { [creator]: null, [opponent]: null },
        shots: { [creator]: [], [opponent]: [] },
        points: { [creator]: 0, [opponent]: 0 },
        timeouts: { [creator]: 0, [opponent]: 0 },
        online: { [creator]: false, [opponent]: false },
        phase: 'setup',
        turnUserId: null,
        turnStartedAt: null,
        turnSeq: 0,
        setupDeadline: Date.now() + SETUP_SECONDS * 1000,
        winnerUserId: null,
        endReason: null,
      };
      await this.persist(match);
      await this.cacheService.addDeadline(
        deadlineMember(room.id, 'setup', 0),
        match.setupDeadline,
      );
      return match;
    });
  }

  /** Submit a fleet. Returns whether both players are now ready (→ play). */
  setFleet(
    roomId: string,
    userId: string,
    placements: FleetPlacements,
  ): Promise<{
    bothReady: boolean;
    firstTurnUserId: string;
    turnDeadline: number;
  }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      if (match.phase !== 'setup') {
        throw new ConflictException('Fleet setup is already complete.');
      }
      if (!isValidFleet(placements)) {
        throw new BadRequestException('Invalid fleet placement.');
      }
      match.fleets[userId] = placements;
      const bothReady = this.players(match).every(p => match.fleets[p]);
      if (bothReady) {
        match.phase = 'play';
        match.turnUserId = match.players[0];
        this.restartTurnClock(match);
      }
      await this.persist(match);
      if (bothReady) {
        // The stale setup deadline stays in the ZSET; the sweeper drops it
        // because the match is no longer in setup.
        await this.scheduleTurnDeadline(match);
      }
      return {
        bothReady,
        firstTurnUserId: match.players[0],
        turnDeadline: this.deadline(match),
      };
    });
  }

  /** Resolve a shot (single / torpedo / bomb) and advance the match. */
  fire(
    roomId: string,
    userId: string,
    kind: FireKind,
    row: number,
    col: number,
  ): Promise<ShotPayload> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      if (match.phase !== 'play') {
        throw new ConflictException('The match is not in play.');
      }
      if (match.turnUserId !== userId) {
        throw new ConflictException('It is not your turn.');
      }
      if (kind !== 'single' && match.points[userId]! < POWERUP_COST) {
        throw new ConflictException('Not enough charge points.');
      }

      const opponentId = this.opponentOf(match, userId);
      const opponentFleet = match.fleets[opponentId]!;

      const resolved =
        kind === 'single'
          ? [{ row, col, result: resolveShot(row, col, opponentFleet) }]
          : kind === 'torpedo'
            ? torpedoCells(row, opponentFleet)
            : bombCells(row, col, opponentFleet);

      const alreadyShot = new Set(
        match.shots[userId]!.map(s => `${s.row},${s.col}`),
      );
      const added = resolved.filter(
        s => !alreadyShot.has(`${s.row},${s.col}`),
      );
      if (added.length === 0) {
        throw new ConflictException('You have already fired there.');
      }

      if (kind !== 'single') {
        match.points[userId]! -= POWERUP_COST;
      }
      const hits = added.filter(s => s.result === 'hit').length;
      match.points[userId]! += hits * POINTS_PER_HIT;

      const before = sunkShipIds(opponentFleet, match.shots[userId]!);
      match.shots[userId] = [...match.shots[userId]!, ...added];
      const after = sunkShipIds(opponentFleet, match.shots[userId]!);
      const sunkShips: RevealedShip[] = [...after]
        .filter(id => !before.has(id))
        .map(id => this.revealed(id, opponentFleet));

      // Hit → keep firing; only a wholly-missed shot passes the turn.
      const anyHit = added.some(s => s.result === 'hit');
      let winnerUserId: string | null = null;
      let nextTurnUserId: string;
      if (after.size === FLEET.length) {
        match.phase = 'over';
        match.winnerUserId = userId;
        match.endReason = 'complete';
        winnerUserId = userId;
        nextTurnUserId = userId;
      } else if (anyHit) {
        nextTurnUserId = userId;
      } else {
        nextTurnUserId = opponentId;
        match.turnUserId = opponentId;
      }
      // Any move (that doesn't end the game) restarts the turn clock.
      if (!winnerUserId) {
        this.restartTurnClock(match);
      }
      await this.persist(match);
      if (!winnerUserId) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        byUserId: userId,
        kind,
        cells: added,
        sunkShips,
        points: { ...match.points },
        nextTurnUserId,
        turnDeadline: this.deadline(match),
        winnerUserId,
      };
    });
  }

  /**
   * The current turn ran out. The idle player accrues a timeout; on the
   * MAX_TIMEOUTS-th they forfeit the match. Otherwise the turn passes on.
   * `seq` is the turnSeq the deadline was armed for — a mismatch means the
   * turn already advanced, so there is nothing to enforce (returns null).
   */
  timeoutTurn(roomId: string, seq: number): Promise<TurnTimeoutPayload | null> {
    return this.locked(roomId, async () => {
      const match = await this.load(roomId);
      if (
        !match ||
        match.phase !== 'play' ||
        !match.turnUserId ||
        match.turnSeq !== seq
      ) {
        return null;
      }
      const timedOutUserId = match.turnUserId;
      const opponentId = this.opponentOf(match, timedOutUserId);
      match.timeouts[timedOutUserId]! += 1;

      let winnerUserId: string | null = null;
      let nextTurnUserId: string;
      if (match.timeouts[timedOutUserId]! >= MAX_TIMEOUTS) {
        match.phase = 'over';
        match.winnerUserId = opponentId;
        match.endReason = 'timeout';
        winnerUserId = opponentId;
        nextTurnUserId = timedOutUserId;
      } else {
        match.turnUserId = opponentId;
        this.restartTurnClock(match);
        nextTurnUserId = opponentId;
      }
      await this.persist(match);
      if (!winnerUserId) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        timedOutUserId,
        nextTurnUserId,
        timeouts: { ...match.timeouts },
        turnDeadline: this.deadline(match),
        winnerUserId,
      };
    });
  }

  /** A player leaves → the opponent wins. Returns the winner. */
  forfeit(roomId: string, userId: string): Promise<{ winnerUserId: string }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      const opponentId = this.opponentOf(match, userId);
      match.phase = 'over';
      match.winnerUserId = opponentId;
      match.endReason = 'forfeit';
      await this.persist(match);
      return { winnerUserId: opponentId };
    });
  }

  /**
   * The fleet-setup window ran out. Any player who never deployed forfeits: a
   * ready player wins; if neither deployed, the match is voided (no winner).
   * Returns null when there is nothing to enforce (match gone or already
   * past setup — e.g. both players readied before the deadline popped).
   */
  timeoutSetup(roomId: string): Promise<{ winnerUserId: string | null } | null> {
    return this.locked(roomId, async () => {
      const match = await this.load(roomId);
      if (!match || match.phase !== 'setup') {
        return null;
      }
      const ready = this.players(match).filter(p => match.fleets[p]);
      const winnerUserId = ready.length === 1 ? ready[0]! : null;
      match.phase = 'over';
      match.winnerUserId = winnerUserId;
      match.endReason = 'setup-timeout';
      await this.persist(match);
      return { winnerUserId };
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

  /** Personalized snapshot: own fleet + both shot logs; opponent ships only as sunk reveals. */
  async stateFor(roomId: string, userId: string): Promise<BattleshipRoomState> {
    // Read-only snapshot — no lock needed.
    const match = await this.require(roomId);
    this.assertParticipant(match, userId);
    const opponentId = this.opponentOf(match, userId);
    const opponentFleet = match.fleets[opponentId];
    const myShots = match.shots[userId]!;
    const revealedOpponentShips = opponentFleet
      ? [...sunkShipIds(opponentFleet, myShots)].map(id =>
          this.revealed(id, opponentFleet),
        )
      : [];

    return {
      roomId,
      phase: match.phase,
      myFleet: match.fleets[userId] ?? null,
      opponentReady: Boolean(opponentFleet),
      myShots,
      opponentShots: match.shots[opponentId]!,
      revealedOpponentShips,
      points: { ...match.points },
      turnUserId: match.turnUserId,
      turnDeadline: match.phase === 'play' ? this.deadline(match) : null,
      setupDeadline: match.phase === 'setup' ? match.setupDeadline : null,
      timeouts: { ...match.timeouts },
      online: { ...match.online },
      winnerUserId: match.winnerUserId,
      endReason: match.endReason,
      opponentUserId: opponentId,
    };
  }

  async remove(roomId: string): Promise<void> {
    await this.cacheService.del(
      CacheKeys.battleshipMatch(roomId),
      CacheKeys.battleshipChat(roomId),
    );
  }

  // --- cache plumbing ----------------------------------------------------------

  private locked<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    return this.cacheService.withLock(
      CacheKeys.battleshipLock(roomId),
      MATCH_LOCK_TTL_MS,
      fn,
    );
  }

  private load(roomId: string): Promise<MatchState | null> {
    return this.cacheService.getJson<MatchState>(
      CacheKeys.battleshipMatch(roomId),
    );
  }

  private persist(match: MatchState): Promise<void> {
    // TTL refreshed on every write — finished/abandoned matches expire away.
    return this.cacheService.setJson(
      CacheKeys.battleshipMatch(match.roomId),
      match,
      MATCH_TTL_SECONDS,
    );
  }

  /** New turn (or clock restart) — bump the seq so older deadlines go stale. */
  private restartTurnClock(match: MatchState): void {
    match.turnStartedAt = Date.now();
    match.turnSeq += 1;
  }

  private scheduleTurnDeadline(match: MatchState): Promise<void> {
    return this.cacheService.addDeadline(
      deadlineMember(match.roomId, 'turn', match.turnSeq),
      this.deadline(match),
    );
  }

  // --- match logic helpers -------------------------------------------------------

  private deadline(match: MatchState): number {
    return (match.turnStartedAt ?? Date.now()) + TURN_SECONDS * 1000;
  }

  private async require(roomId: string): Promise<MatchState> {
    const match = await this.load(roomId);
    if (!match) {
      throw new NotFoundException('Match not found.');
    }
    return match;
  }

  private players(match: MatchState): string[] {
    return match.players;
  }

  private assertParticipant(match: MatchState, userId: string): void {
    if (!match.players.includes(userId)) {
      throw new ForbiddenException('You are not part of this match.');
    }
  }

  private opponentOf(match: MatchState, userId: string): string {
    return match.players[0] === userId ? match.players[1] : match.players[0];
  }

  private revealed(id: string, fleet: FleetPlacements): RevealedShip {
    return { id, size: SHIP_BY_ID[id]!.size, placement: fleet[id]! };
  }
}
