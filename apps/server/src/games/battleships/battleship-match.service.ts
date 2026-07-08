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

import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { GameRoomStatus } from '../../db/types/game';

type MatchState = {
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
  /** Epoch ms fleet setup auto-forfeits (fixed at match creation). */
  setupDeadline: number;
  winnerUserId: string | null;
  /** Why the match ended (null while still in progress). */
  endReason: BattleshipEndReason | null;
};

/**
 * Server-authoritative Battleship match state, held in memory (lost on
 * restart — happy path only). One entry per active room.
 */
@Injectable()
export class BattleshipMatchService {
  private readonly matches = new Map<string, MatchState>();

  /** Fetch (or lazily create) the match for a filled, in-progress room. */
  getOrCreate(room: GameRoomEntity): MatchState {
    const existing = this.matches.get(room.id);
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
      setupDeadline: Date.now() + SETUP_SECONDS * 1000,
      winnerUserId: null,
      endReason: null,
    };
    this.matches.set(room.id, match);
    return match;
  }

  /** Submit a fleet. Returns whether both players are now ready (→ play). */
  setFleet(
    roomId: string,
    userId: string,
    placements: FleetPlacements,
  ): { bothReady: boolean; firstTurnUserId: string; turnDeadline: number } {
    const match = this.require(roomId);
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
      match.turnStartedAt = Date.now();
    }
    return {
      bothReady,
      firstTurnUserId: match.players[0],
      turnDeadline: this.deadline(match),
    };
  }

  /** Resolve a shot (single / torpedo / bomb) and advance the match. */
  fire(
    roomId: string,
    userId: string,
    kind: FireKind,
    row: number,
    col: number,
  ): ShotPayload {
    const match = this.require(roomId);
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
      match.turnStartedAt = Date.now();
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
  }

  /**
   * The current turn ran out. The idle player accrues a timeout; on the
   * MAX_TIMEOUTS-th they forfeit the match. Otherwise the turn passes on.
   */
  timeoutTurn(roomId: string): TurnTimeoutPayload {
    const match = this.require(roomId);
    if (match.phase !== 'play' || !match.turnUserId) {
      throw new ConflictException('The match is not in play.');
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
      match.turnStartedAt = Date.now();
      nextTurnUserId = opponentId;
    }

    return {
      timedOutUserId,
      nextTurnUserId,
      timeouts: { ...match.timeouts },
      turnDeadline: this.deadline(match),
      winnerUserId,
    };
  }

  /** A player leaves → the opponent wins. Returns the winner. */
  forfeit(roomId: string, userId: string): { winnerUserId: string } {
    const match = this.require(roomId);
    this.assertParticipant(match, userId);
    const opponentId = this.opponentOf(match, userId);
    match.phase = 'over';
    match.winnerUserId = opponentId;
    match.endReason = 'forfeit';
    return { winnerUserId: opponentId };
  }

  /**
   * The fleet-setup window ran out. Any player who never deployed forfeits: a
   * ready player wins; if neither deployed, the match is voided (no winner).
   */
  timeoutSetup(roomId: string): { winnerUserId: string | null } {
    const match = this.require(roomId);
    if (match.phase !== 'setup') {
      throw new ConflictException('The match is not in setup.');
    }
    const ready = this.players(match).filter(p => match.fleets[p]);
    const winnerUserId = ready.length === 1 ? ready[0]! : null;
    match.phase = 'over';
    match.winnerUserId = winnerUserId;
    match.endReason = 'setup-timeout';
    return { winnerUserId };
  }

  /** Update a player's socket-connection state. Returns whether it's an active match. */
  setPresence(roomId: string, userId: string, online: boolean): boolean {
    const match = this.matches.get(roomId);
    if (!match || !match.players.includes(userId)) {
      return false;
    }
    match.online[userId] = online;
    return true;
  }

  /** Personalized snapshot: own fleet + both shot logs; opponent ships only as sunk reveals. */
  stateFor(roomId: string, userId: string): BattleshipRoomState {
    const match = this.require(roomId);
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

  remove(roomId: string): void {
    this.matches.delete(roomId);
  }

  private deadline(match: MatchState): number {
    return (match.turnStartedAt ?? Date.now()) + TURN_SECONDS * 1000;
  }

  private require(roomId: string): MatchState {
    const match = this.matches.get(roomId);
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
