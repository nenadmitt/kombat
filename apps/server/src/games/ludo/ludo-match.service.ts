import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ABILITY_COST_HP,
  addChargeHp,
  addJump,
  addShield,
  allTokensHome,
  applyMove,
  chargeHpForRoll,
  colorForSeat,
  DIE_SIDES,
  dropColorJumps,
  dropColorShields,
  freshAbilityUses,
  hasJump,
  initialTokens,
  jumpableTokens,
  jumpDistance,
  jumpsFor,
  LAUNCH_DISTANCE,
  launchableTokens,
  launcherTarget,
  legalMoves,
  LUDO_MAX_PLAYERS,
  LudoAbilityKind,
  LudoAbilityStatePayload,
  LudoAbilityTurn,
  LudoColor,
  LudoEliminatedPayload,
  LudoEndReason,
  LudoJumpedPayload,
  LudoJumps,
  LudoLaunchedPayload,
  LudoMovedPayload,
  LudoPlayer,
  LudoRolledPayload,
  LudoRoomState,
  LudoShieldedPayload,
  LudoShields,
  LudoStage,
  LudoTeleportedPayload,
  LudoTokens,
  LudoTurnTimeoutPayload,
  MAX_CONSECUTIVE_SIXES,
  MAX_TIMEOUTS,
  moveBonusHp,
  nextColorInPlay,
  resetTokensToBase,
  shieldableTokens,
  TELEPORT_TO,
  teleportableTokens,
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
import { LudoDieRoller } from './ludo.dice';

export type LudoMatchState = {
  roomId: string;
  // Join order (creator first), which is also the turn order.
  players: LudoPlayer[];
  tokens: LudoTokens;
  phase: 'play' | 'over';
  turnUserId: string;
  stage: LudoStage;
  die: number | null;
  sixChain: number;
  movable: number[];
  eliminated: LudoColor[];
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  // Optional: missing on matches cached by an older build.
  captureCounts?: Record<string, number>;
  // In half-points.
  chargeHp: Record<string, number>;
  abilityUses: Record<string, Record<LudoAbilityKind, number>>;
  jumps: LudoJumps;
  shields: LudoShields;
  turnStartedAt: number | null;
  turnSeq: number;
  winnerUserId: string | null;
  endReason: LudoEndReason | null;
};

@Injectable()
export class LudoMatchService {
  constructor(
    private readonly cacheService: CacheService,
    private readonly dieRoller: LudoDieRoller,
  ) {}

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
        captureCounts: Object.fromEntries(userIds.map(id => [id, 0])),
        chargeHp: Object.fromEntries(userIds.map(id => [id, 0])),
        abilityUses: Object.fromEntries(
          userIds.map(id => [id, freshAbilityUses()]),
        ),
        jumps: {},
        shields: {},
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

  roll(roomId: string, userId: string): Promise<LudoRolledPayload> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertTurn(match, userId, 'roll');

      const die = this.dieRoller.roll();
      const sixChain = die === DIE_SIDES ? match.sixChain + 1 : 0;
      const thirdSix = sixChain >= MAX_CONSECUTIVE_SIXES;
      const color = this.colorOf(match, userId);
      const movable = thirdSix
        ? []
        : legalMoves(match.tokens, color, die, jumpsFor(match.jumps, color));
      match.chargeHp[userId] = addChargeHp(
        match.chargeHp[userId] ?? 0,
        chargeHpForRoll(die),
      );

      if (movable.length > 0) {
        match.stage = 'move';
        match.die = die;
        match.sixChain = sixChain;
        match.movable = movable;
      } else if (!thirdSix && die === DIE_SIDES) {
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
        chargeHp: { ...match.chargeHp },
      };
    });
  }

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
      const distance = jumpDistance(
        (match.tokens[color] ?? [])[tokenIndex]!,
        die,
        hasJump(match.jumps, color, tokenIndex),
      );
      const result = applyMove(
        match.tokens,
        color,
        tokenIndex,
        distance,
        match.shields,
      );
      match.tokens = result.tokens;
      this.creditCaptures(match, userId, result.captures.length);
      this.creditMove(
        match,
        userId,
        color,
        result.toProgress,
        result.captures.length,
      );
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
        captureCounts: { ...(match.captureCounts ?? {}) },
        tokens: result.tokens,
        extraRoll: extraRoll && !winnerUserId,
        chargeHp: { ...match.chargeHp },
        stage: match.stage,
        nextTurnUserId: match.turnUserId,
        turnDeadline: this.deadline(match),
        winnerUserId,
      };
    });
  }

  launch(
    roomId: string,
    userId: string,
    tokenIndex: number,
  ): Promise<{
    launched: LudoLaunchedPayload;
    owner: LudoAbilityStatePayload;
  }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertMyTurn(match, userId);

      const color = this.colorOf(match, userId);
      if (!launchableTokens(match.tokens, color).includes(tokenIndex)) {
        throw new ConflictException('That pawn cannot be launched.');
      }
      const from = match.tokens[color]![tokenIndex]!;
      const to = launcherTarget(from, LAUNCH_DISTANCE)!;

      this.spend(match, userId, 'launcher');

      const result = applyMove(
        match.tokens,
        color,
        tokenIndex,
        to - from,
        match.shields,
      );
      match.tokens = result.tokens;
      this.creditCaptures(match, userId, result.captures.length);
      this.creditMove(match, userId, color, to, result.captures.length);

      let winnerUserId: string | null = null;
      let passed = false;
      if (allTokensHome(match.tokens, color)) {
        match.phase = 'over';
        match.winnerUserId = userId;
        match.endReason = 'complete';
        winnerUserId = userId;
      } else {
        passed = this.settleAbilityTurn(match, userId);
      }
      await this.persist(match);
      if (passed) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        launched: {
          byUserId: userId,
          color,
          tokenIndex,
          fromProgress: from,
          toProgress: to,
          captures: result.captures,
          captureCounts: { ...(match.captureCounts ?? {}) },
          tokens: result.tokens,
          chargeHp: { ...match.chargeHp },
          turn: this.turnSnapshot(match),
          winnerUserId,
        },
        owner: this.abilityState(match, userId),
      };
    });
  }

  addJumpAbility(
    roomId: string,
    userId: string,
    tokenIndex: number,
  ): Promise<{ jumped: LudoJumpedPayload; owner: LudoAbilityStatePayload }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertMyTurn(match, userId);

      const color = this.colorOf(match, userId);
      const targets = jumpableTokens(match.tokens, color, match.jumps);
      if (!targets.includes(tokenIndex)) {
        throw new ConflictException('That pawn cannot take Extra Jump.');
      }

      this.spend(match, userId, 'jump');
      match.jumps = addJump(match.jumps, color, tokenIndex);
      const passed = this.settleAbilityTurn(match, userId);
      await this.persist(match);
      if (passed) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        jumped: {
          byUserId: userId,
          color,
          tokenIndex,
          chargeHp: { ...match.chargeHp },
          jumps: match.jumps,
          turn: this.turnSnapshot(match),
        },
        owner: this.abilityState(match, userId),
      };
    });
  }

  teleport(
    roomId: string,
    userId: string,
    tokenIndex: number,
  ): Promise<{
    teleported: LudoTeleportedPayload;
    owner: LudoAbilityStatePayload;
  }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertMyTurn(match, userId);

      const color = this.colorOf(match, userId);
      const targets = teleportableTokens(match.tokens, color);
      if (!targets.includes(tokenIndex)) {
        throw new ConflictException('That pawn cannot teleport.');
      }
      const from = (match.tokens[color] ?? [])[tokenIndex]!;

      this.spend(match, userId, 'teleport');
      match.tokens = {
        ...match.tokens,
        [color]: (match.tokens[color] ?? []).map((p, i) =>
          i === tokenIndex ? TELEPORT_TO : p,
        ),
      };
      const passed = this.settleAbilityTurn(match, userId);
      await this.persist(match);
      if (passed) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        teleported: {
          byUserId: userId,
          color,
          tokenIndex,
          fromProgress: from,
          toProgress: TELEPORT_TO,
          tokens: match.tokens,
          chargeHp: { ...match.chargeHp },
          turn: this.turnSnapshot(match),
        },
        owner: this.abilityState(match, userId),
      };
    });
  }

  addShieldAbility(
    roomId: string,
    userId: string,
    tokenIndex: number,
  ): Promise<{ shielded: LudoShieldedPayload; owner: LudoAbilityStatePayload }> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertMyTurn(match, userId);

      const color = this.colorOf(match, userId);
      const targets = shieldableTokens(match.tokens, color, match.shields);
      if (!targets.includes(tokenIndex)) {
        throw new ConflictException('That pawn cannot take a shield.');
      }

      this.spend(match, userId, 'shield');
      match.shields = addShield(match.shields, color, tokenIndex);
      const passed = this.settleAbilityTurn(match, userId);
      await this.persist(match);
      if (passed) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        shielded: {
          byUserId: userId,
          color,
          tokenIndex,
          chargeHp: { ...match.chargeHp },
          shields: match.shields,
          turn: this.turnSnapshot(match),
        },
        owner: this.abilityState(match, userId),
      };
    });
  }

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
        jumps: match.jumps,
        shields: match.shields,
        nextTurnUserId: match.turnUserId,
        turnDeadline: this.deadline(match),
        winnerUserId,
      };
    });
  }

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
        this.restartTurnClock(match);
      }
      await this.persist(match);
      if (!winnerUserId && wasTheirTurn) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        userId,
        color,
        tokens: match.tokens,
        jumps: match.jumps,
        shields: match.shields,
        nextTurnUserId: match.turnUserId,
        turnDeadline: this.deadline(match),
        winnerUserId,
      };
    });
  }

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
      captureCounts: { ...(match.captureCounts ?? {}) },
      winnerUserId: match.winnerUserId,
      endReason: match.endReason,
      turnDeadline: match.phase === 'play' ? this.deadline(match) : null,
      chargeHp: { ...match.chargeHp },
      jumps: match.jumps,
      shields: match.shields,
      abilityUses: match.abilityUses[userId] ?? freshAbilityUses(),
    };
  }

  async remove(roomId: string): Promise<void> {
    await this.cacheService.del(CacheKeys.ludoMatch(roomId));
  }

  private locked<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    return this.cacheService.withLock(
      CacheKeys.ludoLock(roomId),
      MATCH_LOCK_TTL_MS,
      fn,
    );
  }

  private async load(roomId: string): Promise<LudoMatchState | null> {
    const match = await this.cacheService.getJson<LudoMatchState>(
      CacheKeys.ludoMatch(roomId),
    );
    if (!match) {
      return null;
    }
    // Matches cached before an ability shipped carry no field for it.
    const partial = match as Partial<LudoMatchState>;
    return {
      ...match,
      chargeHp: partial.chargeHp ?? {},
      abilityUses: Object.fromEntries(
        Object.entries(partial.abilityUses ?? {}).map(([id, uses]) => [
          id,
          { ...freshAbilityUses(), ...uses },
        ]),
      ),
      jumps: partial.jumps ?? {},
      shields: partial.shields ?? {},
    };
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

  private assertMyTurn(match: LudoMatchState, userId: string): void {
    this.assertParticipant(match, userId);
    if (match.phase !== 'play') {
      throw new ConflictException('The match is not in play.');
    }
    if (match.turnUserId !== userId) {
      throw new ConflictException('It is not your turn.');
    }
  }

  private assertTurn(
    match: LudoMatchState,
    userId: string,
    stage: LudoStage,
  ): void {
    this.assertMyTurn(match, userId);
    if (match.stage !== stage) {
      throw new ConflictException(
        stage === 'roll' ? 'Pick a token to move first.' : 'Roll the die first.',
      );
    }
  }

  private colorOf(match: LudoMatchState, userId: string): LudoColor {
    return match.players.find(p => p.userId === userId)!.color;
  }

  private userOf(match: LudoMatchState, color: LudoColor): string {
    return match.players.find(p => p.color === color)!.userId;
  }

  private creditCaptures(
    match: LudoMatchState,
    userId: string,
    count: number,
  ): void {
    if (count === 0) {
      return;
    }
    match.captureCounts = match.captureCounts ?? {};
    match.captureCounts[userId] = (match.captureCounts[userId] ?? 0) + count;
  }

  private creditMove(
    match: LudoMatchState,
    userId: string,
    color: LudoColor,
    toProgress: number,
    captureCount: number,
  ): void {
    match.chargeHp[userId] = addChargeHp(
      match.chargeHp[userId] ?? 0,
      moveBonusHp(color, toProgress, captureCount),
    );
  }

  private spend(
    match: LudoMatchState,
    userId: string,
    kind: LudoAbilityKind,
  ): void {
    const uses = match.abilityUses[userId] ?? freshAbilityUses();
    if ((uses[kind] ?? 0) <= 0) {
      throw new ConflictException('No uses left for that ability.');
    }
    const charge = match.chargeHp[userId] ?? 0;
    if (charge < ABILITY_COST_HP[kind]) {
      throw new ConflictException('Not enough ability points.');
    }
    match.abilityUses[userId] = { ...uses, [kind]: uses[kind]! - 1 };
    match.chargeHp[userId] = charge - ABILITY_COST_HP[kind];
  }

  private abilityState(
    match: LudoMatchState,
    userId: string,
  ): LudoAbilityStatePayload {
    return {
      chargeHp: match.chargeHp[userId] ?? 0,
      usesLeft: match.abilityUses[userId] ?? freshAbilityUses(),
    };
  }

  // Casting never buys more time: the clock restarts only if the turn passed, and then the caller must reschedule.
  private settleAbilityTurn(match: LudoMatchState, userId: string): boolean {
    if (match.stage !== 'move') {
      return false;
    }
    const color = this.colorOf(match, userId);
    const movable = legalMoves(
      match.tokens,
      color,
      match.die!,
      jumpsFor(match.jumps, color),
    );
    if (movable.length > 0) {
      match.movable = movable;
      return false;
    }
    this.passTurn(match);
    this.restartTurnClock(match);
    return true;
  }

  private turnSnapshot(match: LudoMatchState): LudoAbilityTurn {
    return {
      stage: match.stage,
      movableTokens: [...match.movable],
      nextTurnUserId: match.turnUserId,
      turnDeadline: this.deadline(match),
    };
  }

  private passTurn(match: LudoMatchState): void {
    const colors = match.players.map(p => p.color);
    const current = this.colorOf(match, match.turnUserId);
    const next = nextColorInPlay(colors, current, match.eliminated);
    match.turnUserId = this.userOf(match, next);
    match.stage = 'roll';
    match.die = null;
    match.sixChain = 0;
    match.movable = [];
  }

  private eliminate(
    match: LudoMatchState,
    userId: string,
    reason: LudoEndReason,
  ): string | null {
    const color = this.colorOf(match, userId);
    match.eliminated = [...match.eliminated, color];
    match.tokens = resetTokensToBase(match.tokens, color);
    match.jumps = dropColorJumps(match.jumps, color);
    match.shields = dropColorShields(match.shields, color);

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
