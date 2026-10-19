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
  players: [string, string];
  fleets: Record<string, FleetPlacements | null>;
  mines: Record<string, (MinePlacement & { triggered: boolean })[]>;
  // Includes blast cells from a triggered mine, recorded as shots on the opponent's behalf.
  shots: Record<string, Shot[]>;
  points: Record<string, number>;
  powerupsUsed: Record<string, Record<PowerupKind, number>>;
  volleys: Record<string, VolleyStats>;
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  phase: 'setup' | 'play' | 'over';
  turnUserId: string | null;
  turnStartedAt: number | null;
  // Deadlines carry the seq they were armed for, so one popped for an old turn is dropped as stale.
  turnSeq: number;
  setupDeadline: number;
  winnerUserId: string | null;
  endReason: BattleshipEndReason | null;
};

@Injectable()
export class BattleshipMatchService {
  constructor(private readonly cacheService: CacheService) {}

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
        await this.scheduleTurnDeadline(match);
      }
      return {
        bothReady,
        firstTurnUserId: match.players[0],
        turnDeadline: this.deadline(match),
      };
    });
  }

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

      // A struck mine blasts the firer's own board: its cells count as the opponent's shots.
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

  forfeit(roomId: string, userId: string): Promise<{ winnerUserId: string }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      // Finished matches stay cached for the TTL; without this guard every replay would settle again.
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

  async stateFor(roomId: string, userId: string): Promise<BattleshipRoomState> {
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
      // Backfill fields for matches cached by an older build so they survive a deploy.
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
    return this.cacheService.setJson(
      CacheKeys.battleshipMatch(match.roomId),
      match,
      MATCH_TTL_SECONDS,
    );
  }

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
