import { randomInt } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  MAX_TIMEOUTS,
  SALVO_MAX_HP,
  SALVO_MOVE_RANGE,
  SALVO_START_ANGLE,
  SALVO_START_POWER,
  SALVO_FIELD_HEIGHT,
  SALVO_TANK_START_X,
  SALVO_TURN_SECONDS,
  SalvoEndReason,
  SalvoMovedPayload,
  SalvoPlayerStats,
  SalvoRoomState,
  SalvoShotPayload,
  SalvoSide,
  SalvoTank,
  SalvoTurnTimeoutPayload,
  carveCrater,
  clampAngle,
  clampPower,
  clampTankX,
  createSalvoTerrain,
  emptySalvoStats,
  fireShot,
  rollWind,
} from '@gaming-platform/core';

import {
  CacheKeys,
  CacheService,
  deadlineMember,
  MATCH_LOCK_TTL_MS,
  MATCH_TTL_SECONDS,
} from '../../cache';
import { GameRoomEntity } from '../../db/entities/game-room.entity';
import { participantsOf } from '../room.util';
import { GameRoomStatus } from '../../db/types/game';

export type SalvoMatchState = {
  roomId: string;
  players: [string, string];
  terrain: number[];
  hp: Record<string, number>;
  x: Record<string, number>;
  // Each player's last fired aim, never their live undisclosed dial.
  angle: Record<string, number>;
  power: Record<string, number>;
  stats: Record<string, SalvoPlayerStats>;
  turnUserId: string;
  movesLeft: number;
  wind: number;
  // 1-based.
  shotNumber: number;
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  phase: 'play' | 'over';
  winnerUserId: string | null;
  endReason: SalvoEndReason | null;
  turnStartedAt: number;
  turnSeq: number;
};

// randomInt caps its range at 2^48 - 1.
const cryptoRand = () => randomInt(0, 281474976710655) / 281474976710655;

const roundOf = (shotNumber: number) => Math.ceil(shotNumber / 2);

@Injectable()
export class SalvoMatchService {
  constructor(private readonly cacheService: CacheService) {}

  getOrCreate(room: GameRoomEntity): Promise<SalvoMatchState> {
    return this.locked(room.id, async () => {
      const existing = await this.load(room.id);
      if (existing) {
        return existing;
      }
      // Salvo seats its joiner in opponent_id, not opponent_ids: always read the roster via participantsOf.
      const roster = participantsOf(room);
      if (room.status !== GameRoomStatus.InProgress || roster.length !== 2) {
        throw new ConflictException('The room has not started yet.');
      }
      const players: [string, string] = [roster[0]!, roster[1]!];
      const [left, right] = players;

      const match: SalvoMatchState = {
        roomId: room.id,
        players,
        terrain: createSalvoTerrain(randomInt(0, 0xffffffff)).heights,
        hp: { [left]: SALVO_MAX_HP, [right]: SALVO_MAX_HP },
        x: {
          [left]: SALVO_TANK_START_X[SalvoSide.Left],
          [right]: SALVO_TANK_START_X[SalvoSide.Right],
        },
        angle: { [left]: SALVO_START_ANGLE, [right]: SALVO_START_ANGLE },
        power: { [left]: SALVO_START_POWER, [right]: SALVO_START_POWER },
        stats: { [left]: emptySalvoStats(), [right]: emptySalvoStats() },
        turnUserId: left,
        movesLeft: SALVO_MOVE_RANGE,
        wind: rollWind(cryptoRand),
        shotNumber: 1,
        timeouts: { [left]: 0, [right]: 0 },
        online: { [left]: false, [right]: false },
        phase: 'play',
        winnerUserId: null,
        endReason: null,
        turnStartedAt: Date.now(),
        turnSeq: 0,
      };
      await this.persist(match);
      await this.scheduleTurnDeadline(match);
      return match;
    });
  }

  // Clamped to what is reachable from the server's positions rather than rejected.
  move(roomId: string, userId: string, toX: number): Promise<SalvoMovedPayload> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertTurn(match, userId);

      const side = this.sideOf(match, userId);
      const otherX = match.x[this.opponentOf(match, userId)]!;
      const from = match.x[userId]!;
      const wanted = Math.min(Math.abs(toX - from), match.movesLeft);
      const next = clampTankX(
        from,
        wanted * Math.sign(toX - from),
        side,
        otherX,
      );
      const travelled = Math.abs(next - from);
      if (travelled <= 0) {
        throw new ConflictException('Your tank cannot move any further.');
      }

      match.x[userId] = next;
      match.movesLeft = Math.max(0, match.movesLeft - travelled);
      await this.persist(match);

      return { byUserId: userId, x: next, movesLeft: match.movesLeft };
    });
  }

  // Integrated here and shipped whole: float maths is not bit-identical across JS engines.
  fire(
    roomId: string,
    userId: string,
    angle: number,
    power: number,
  ): Promise<SalvoShotPayload> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertTurn(match, userId);

      const opponentId = this.opponentOf(match, userId);
      const aim = { angle: clampAngle(angle), power: clampPower(power) };
      // Shared by reference, so carveCrater mutates the match's own terrain.
      const terrain = {
        width: match.terrain.length,
        height: SALVO_FIELD_HEIGHT,
        heights: match.terrain,
      };
      const shot = fireShot(
        terrain,
        this.tankOf(match, userId, aim),
        this.tankOf(match, opponentId),
        match.wind,
      );

      // Only ground hits leave a crater; clients carve the identical one from `crater`.
      if (shot.kind === 'terrain') {
        carveCrater(terrain, shot.impact);
      }

      match.angle[userId] = aim.angle;
      match.power[userId] = aim.power;

      const round = roundOf(match.shotNumber);
      const stats = match.stats[userId]!;
      stats.shots += 1;
      if (shot.hit) {
        stats.hits += 1;
        stats.bestHit = Math.max(stats.bestHit, shot.damage);
      }
      while (stats.damageByRound.length < round) {
        stats.damageByRound.push(0);
      }
      stats.damageByRound[round - 1] =
        (stats.damageByRound[round - 1] ?? 0) + shot.damage;

      match.hp[opponentId] = Math.max(
        0,
        match.hp[opponentId]! - shot.damage,
      );
      match.hp[userId] = Math.max(0, match.hp[userId]! - shot.selfDamage);

      let winnerUserId: string | null = null;
      if (match.hp[opponentId] <= 0 || match.hp[userId]! <= 0) {
        winnerUserId = match.hp[userId]! <= 0 ? opponentId : userId;
        match.phase = 'over';
        match.winnerUserId = winnerUserId;
        match.endReason = 'destroyed';
      }

      if (!winnerUserId) {
        this.advanceTurn(match);
      }
      await this.persist(match);
      if (!winnerUserId) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        byUserId: userId,
        angle: aim.angle,
        power: aim.power,
        path: shot.path,
        impact: shot.impact,
        kind: shot.kind,
        damage: shot.damage,
        damageKind: shot.damageKind,
        selfDamage: shot.selfDamage,
        hp: { ...match.hp },
        stats: { ...match.stats },
        crater: shot.kind === 'terrain' ? shot.impact : null,
        nextTurnUserId: match.turnUserId,
        wind: match.wind,
        shotNumber: match.shotNumber,
        round: roundOf(match.shotNumber),
        turnDeadline: winnerUserId ? null : this.deadline(match),
        winnerUserId,
      };
    });
  }

  timeoutTurn(
    roomId: string,
    seq: number,
  ): Promise<SalvoTurnTimeoutPayload | null> {
    return this.locked(roomId, async () => {
      const match = await this.load(roomId);
      if (!match || match.phase !== 'play' || match.turnSeq !== seq) {
        return null;
      }
      const idle = match.turnUserId;
      const opponentId = this.opponentOf(match, idle);
      match.timeouts[idle] = (match.timeouts[idle] ?? 0) + 1;

      let winnerUserId: string | null = null;
      if (match.timeouts[idle]! >= MAX_TIMEOUTS) {
        winnerUserId = opponentId;
        match.phase = 'over';
        match.winnerUserId = winnerUserId;
        match.endReason = 'timeout';
      } else {
        this.advanceTurn(match);
      }
      await this.persist(match);
      if (!winnerUserId) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        timedOutUserId: idle,
        timeouts: match.timeouts[idle]!,
        nextTurnUserId: match.turnUserId,
        turnDeadline: winnerUserId ? null : this.deadline(match),
        winnerUserId,
      };
    });
  }

  forfeit(roomId: string, userId: string): Promise<{ winnerUserId: string }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      if (match.phase !== 'play') {
        throw new ConflictException('The match is already over.');
      }
      const winnerUserId = this.opponentOf(match, userId);
      match.phase = 'over';
      match.winnerUserId = winnerUserId;
      match.endReason = 'forfeit';
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
      if (!match || !this.players(match).includes(userId)) {
        return false;
      }
      match.online[userId] = online;
      await this.persist(match);
      return match.phase === 'play';
    });
  }

  async stateFor(roomId: string): Promise<SalvoRoomState> {
    const match = await this.require(roomId);
    return {
      phase: match.phase,
      terrain: match.terrain,
      seats: this.players(match).map(userId => ({
        userId,
        side: this.sideOf(match, userId),
        x: match.x[userId]!,
        hp: match.hp[userId]!,
        angle: match.angle[userId]!,
        power: match.power[userId]!,
        online: match.online[userId] ?? false,
      })),
      turnUserId: match.turnUserId,
      movesLeft: match.movesLeft,
      wind: match.wind,
      shotNumber: match.shotNumber,
      round: roundOf(match.shotNumber),
      turnDeadline: match.phase === 'play' ? this.deadline(match) : null,
      winnerUserId: match.winnerUserId,
      endReason: match.endReason,
      stats: { ...match.stats },
    };
  }

  async remove(roomId: string): Promise<void> {
    await this.cacheService.del(CacheKeys.salvoMatch(roomId));
  }

  private advanceTurn(match: SalvoMatchState): void {
    const next = this.opponentOf(match, match.turnUserId);
    const shotNumber = match.shotNumber + 1;
    if (roundOf(shotNumber) !== roundOf(match.shotNumber)) {
      match.wind = rollWind(cryptoRand);
    }
    match.turnUserId = next;
    match.shotNumber = shotNumber;
    match.movesLeft = SALVO_MOVE_RANGE;
    match.turnStartedAt = Date.now();
    match.turnSeq += 1;
  }

  private tankOf(
    match: SalvoMatchState,
    userId: string,
    aim?: { angle: number; power: number },
  ): SalvoTank {
    return {
      side: this.sideOf(match, userId),
      x: match.x[userId]!,
      hp: match.hp[userId]!,
      angle: aim?.angle ?? match.angle[userId]!,
      power: aim?.power ?? match.power[userId]!,
    };
  }

  private sideOf(match: SalvoMatchState, userId: string): SalvoSide {
    return match.players[0] === userId ? SalvoSide.Left : SalvoSide.Right;
  }

  private locked<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    return this.cacheService.withLock(
      CacheKeys.salvoLock(roomId),
      MATCH_LOCK_TTL_MS,
      fn,
    );
  }

  private async load(roomId: string): Promise<SalvoMatchState | null> {
    return this.cacheService.getJson<SalvoMatchState>(
      CacheKeys.salvoMatch(roomId),
    );
  }

  private persist(match: SalvoMatchState): Promise<void> {
    return this.cacheService.setJson(
      CacheKeys.salvoMatch(match.roomId),
      match,
      MATCH_TTL_SECONDS,
    );
  }

  private scheduleTurnDeadline(match: SalvoMatchState): Promise<void> {
    return this.cacheService.addDeadline(
      deadlineMember(match.roomId, 'salvo-turn', match.turnSeq),
      this.deadline(match),
    );
  }

  private deadline(match: SalvoMatchState): number {
    return match.turnStartedAt + SALVO_TURN_SECONDS * 1000;
  }

  private async require(roomId: string): Promise<SalvoMatchState> {
    const match = await this.load(roomId);
    if (!match) {
      throw new NotFoundException('Match not found.');
    }
    return match;
  }

  private players(match: SalvoMatchState): string[] {
    return match.players;
  }

  private assertParticipant(match: SalvoMatchState, userId: string): void {
    if (!this.players(match).includes(userId)) {
      throw new ForbiddenException('You are not part of this match.');
    }
  }

  private assertTurn(match: SalvoMatchState, userId: string): void {
    this.assertParticipant(match, userId);
    if (match.phase !== 'play') {
      throw new ConflictException('The match is not in play.');
    }
    if (match.turnUserId !== userId) {
      throw new ConflictException('It is not your turn.');
    }
  }

  private opponentOf(match: SalvoMatchState, userId: string): string {
    return match.players[0] === userId ? match.players[1] : match.players[0];
  }
}
