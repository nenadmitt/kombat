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
  isValidMines,
  MAX_TIMEOUTS,
  MineBlast,
  MinePlacement,
  POINTS_PER_HIT,
  POWERUP_COSTS,
  POWERUP_MAX_USES,
  PowerupKind,
  RevealedShip,
  resolveFire,
  SETUP_SECONDS,
  SHIP_BY_ID,
  Shot,
  ShotPayload,
  TURN_SECONDS,
  TurnTimeoutPayload,
  VolleyStats,
  mineBlastCells,
  sunkShipIds,
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
  /** Sea mines armed on each user's OWN board (with triggered flags). */
  mines: Record<string, (MinePlacement & { triggered: boolean })[]>;
  /** Shots FIRED BY each user (against the opponent). Blast cells from a
   *  triggered mine are appended here too - they damage the opponent's board
   *  on the opponent's behalf. */
  shots: Record<string, Shot[]>;
  points: Record<string, number>;
  /** Power-up uses so far per user (POWERUP_MAX_USES each per match). */
  powerupsUsed: Record<string, Record<PowerupKind, number>>;
  /** Fire-action tallies per user (for end-screen accuracy). */
  volleys: Record<string, VolleyStats>;
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
        mines: { [creator]: [], [opponent]: [] },
        shots: { [creator]: [], [opponent]: [] },
        points: { [creator]: 0, [opponent]: 0 },
        powerupsUsed: {
          [creator]: { torpedo: 0, bomb: 0 },
          [opponent]: { torpedo: 0, bomb: 0 },
        },
        volleys: {
          [creator]: { fired: 0, hit: 0 },
          [opponent]: { fired: 0, hit: 0 },
        },
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

  /** Submit a fleet + mines. Returns whether both players are now ready (→ play). */
  setFleet(
    roomId: string,
    userId: string,
    placements: FleetPlacements,
    mines: MinePlacement[],
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
      if (!isValidMines(mines, placements)) {
        throw new BadRequestException('Invalid mine placement.');
      }
      match.fleets[userId] = placements;
      match.mines[userId] = mines.map(m => ({ ...m, triggered: false }));
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
      if (kind !== 'single') {
        if (match.points[userId]! < POWERUP_COSTS[kind]) {
          throw new ConflictException('Not enough charge points.');
        }
        if (match.powerupsUsed[userId]![kind] >= POWERUP_MAX_USES) {
          throw new ConflictException(
            'You have no uses of that power-up left.',
          );
        }
      }

      const opponentId = this.opponentOf(match, userId);
      const opponentFleet = match.fleets[opponentId]!;
      const liveMines = match.mines[opponentId]!.filter(m => !m.triggered);

      const resolved = resolveFire(kind, row, col, opponentFleet, liveMines);

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
        match.points[userId]! -= POWERUP_COSTS[kind];
        match.powerupsUsed[userId]![kind] += 1;
      }
      const hits = added.filter(s => s.result === 'hit').length;
      match.points[userId]! += hits * POINTS_PER_HIT;
      match.volleys[userId]!.fired += 1;
      if (hits > 0) {
        match.volleys[userId]!.hit += 1;
      }

      const before = sunkShipIds(opponentFleet, match.shots[userId]!);
      match.shots[userId] = [...match.shots[userId]!, ...added];
      const after = sunkShipIds(opponentFleet, match.shots[userId]!);
      const sunkShips: RevealedShip[] = [...after]
        .filter(id => !before.has(id))
        .map(id => this.revealed(id, opponentFleet));

      // Any struck mine explodes against the FIRER's own board: its blast
      // cells count as shots by the opponent (no charge points awarded) and
      // can sink the firer's ships.
      const myFleet = match.fleets[userId]!;
      const mineBlasts: MineBlast[] = [];
      for (const cell of added.filter(s => s.result === 'mine')) {
        const mine = match.mines[opponentId]!.find(
          m => m.row === cell.row && m.col === cell.col,
        )!;
        mine.triggered = true;
        const blastResolved = mineBlastCells(mine, myFleet);
        const opponentShot = new Set(
          match.shots[opponentId]!.map(s => `${s.row},${s.col}`),
        );
        const blastAdded = blastResolved.filter(
          s => !opponentShot.has(`${s.row},${s.col}`),
        );
        const sunkBefore = sunkShipIds(myFleet, match.shots[opponentId]!);
        match.shots[opponentId] = [...match.shots[opponentId]!, ...blastAdded];
        const sunkAfter = sunkShipIds(myFleet, match.shots[opponentId]!);
        mineBlasts.push({
          center: { row: mine.row, col: mine.col },
          cells: blastAdded,
          sunkShips: [...sunkAfter]
            .filter(id => !sunkBefore.has(id))
            .map(id => this.revealed(id, myFleet)),
        });
      }

      // Hit → keep firing; a wholly-missed shot passes the turn - and setting
      // off a mine always ends the turn, hits or not.
      const anyHit = added.some(s => s.result === 'hit');
      const mineTriggered = mineBlasts.length > 0;
      const myShipsAllSunk =
        mineTriggered &&
        sunkShipIds(myFleet, match.shots[opponentId]!).size === FLEET.length;
      let winnerUserId: string | null = null;
      let nextTurnUserId: string;
      if (after.size === FLEET.length) {
        // Sinking the enemy's last ship wins even if the same volley struck a mine.
        match.phase = 'over';
        match.winnerUserId = userId;
        match.endReason = 'complete';
        winnerUserId = userId;
        nextTurnUserId = userId;
      } else if (myShipsAllSunk) {
        // The mine blast finished off the firer's own fleet - opponent wins.
        match.phase = 'over';
        match.winnerUserId = opponentId;
        match.endReason = 'complete';
        winnerUserId = opponentId;
        nextTurnUserId = opponentId;
      } else if (anyHit && !mineTriggered) {
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
        mineBlasts,
        points: { ...match.points },
        powerupsUsed: { ...match.powerupsUsed },
        volleys: { ...match.volleys },
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
      // A finished match stays cached for its whole TTL so both players can
      // still read the 'over' state - without this guard it stays forfeitable
      // too, and every replay fires another settlement at the pot.
      if (match.phase === 'over') {
        throw new ConflictException('The match is already over.');
      }
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
      // Only still-armed mines: a triggered mine is spent, and its cell is
      // already covered by the blast markers.
      myMines: match.fleets[userId]
        ? match.mines[userId]!
            .filter(m => !m.triggered)
            .map(({ row, col }) => ({ row, col }))
        : null,
      opponentReady: Boolean(opponentFleet),
      myShots,
      opponentShots: match.shots[opponentId]!,
      revealedOpponentShips,
      points: { ...match.points },
      powerupsUsed: { ...match.powerupsUsed },
      volleys: { ...match.volleys },
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

  private async load(roomId: string): Promise<MatchState | null> {
    const match = await this.cacheService.getJson<MatchState>(
      CacheKeys.battleshipMatch(roomId),
    );
    if (match) {
      // Backfill fields for matches cached by an older build, so an in-flight
      // match survives a deploy instead of crashing on the next mutation.
      match.mines ??= Object.fromEntries(match.players.map(p => [p, []]));
      match.powerupsUsed ??= Object.fromEntries(
        match.players.map(p => [p, { torpedo: 0, bomb: 0 }]),
      );
      match.volleys ??= Object.fromEntries(
        match.players.map(p => [p, { fired: 0, hit: 0 }]),
      );
    }
    return match;
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
