import { randomInt } from 'node:crypto';

import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  buildDeck,
  CHROMA_HAND_SIZE,
  CHROMA_MAX_PLAYERS,
  ChromaCard,
  ChromaColorPickedPayload,
  ChromaDirection,
  ChromaDrewPayload,
  ChromaEliminatedPayload,
  ChromaEndReason,
  ChromaPassedPayload,
  ChromaPlayedPayload,
  ChromaRoomState,
  ChromaSeat,
  ChromaStage,
  ChromaSuit,
  ChromaTableState,
  ChromaTurnTimeoutPayload,
  chooseBotColor,
  isPlayable,
  MAX_TIMEOUTS,
  nextSeatIndex,
  playEffect,
  shuffle,
  SOLO_PENALTY_DRAWS,
  takeStarter,
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

export type ChromaMatchState = {
  roomId: string;
  /** Seats in join order (creator first) - the base turn order. */
  players: ChromaSeat[];
  hands: Record<string, ChromaCard[]>;
  drawPile: ChromaCard[];
  /** Top of the pile is the LAST element. */
  discard: ChromaCard[];
  activeSuit: ChromaSuit;
  direction: ChromaDirection;
  stage: ChromaStage;
  pendingColorUserId: string | null;
  /** Effects deferred until the wild's colour pick resolves. */
  pendingVictimDraws: number;
  pendingSkip: boolean;
  turnUserId: string;
  /** Set after this turn's draw: only that hand index may be played. */
  drawnIndex: number | null;
  eliminated: string[];
  timeouts: Record<string, number>;
  online: Record<string, boolean>;
  phase: 'play' | 'over';
  turnStartedAt: number | null;
  /** Bumped on every turn-clock restart; stale deadlines carry an old seq. */
  turnSeq: number;
  winnerUserId: string | null;
  endReason: ChromaEndReason | null;
};

/** Public payload + the full hands of every player whose hand changed (the
 *  gateway/sweeper pushes those privately - hands never ride broadcasts). */
export type ChromaMutation<T> = {
  payload: T;
  changedHands: Record<string, ChromaCard[]>;
};

/** Crypto-backed uniform [0,1) for the shared shuffle. */
const cryptoRand = () => randomInt(0, 281474976710655) / 281474976710655;

/**
 * Server-authoritative ChromaClash match state, cached and locked per room
 * like every other game. The server owns the deck: shuffles, deals, draws
 * and legality all resolve here; clients only ever see their own hand plus
 * everyone's counts.
 */
@Injectable()
export class ChromaMatchService {
  constructor(private readonly cacheService: CacheService) {}

  /** Fetch (or lazily create) the match for a started room. */
  getOrCreate(room: GameRoomEntity): Promise<ChromaMatchState> {
    return this.locked(room.id, async () => {
      const existing = await this.load(room.id);
      if (existing) {
        return existing;
      }
      if (room.status !== GameRoomStatus.InProgress) {
        throw new ConflictException('The room has not started yet.');
      }
      const userIds = [room.userId, ...room.opponentIds];
      if (userIds.length < 2 || userIds.length > CHROMA_MAX_PLAYERS) {
        throw new ConflictException('The room has an invalid player count.');
      }
      let deck = shuffle(buildDeck(), cryptoRand);
      const hands: Record<string, ChromaCard[]> = {};
      for (const userId of userIds) {
        hands[userId] = deck.splice(0, CHROMA_HAND_SIZE);
      }
      const { starter, deck: rest } = takeStarter(deck);
      deck = rest;

      const match: ChromaMatchState = {
        roomId: room.id,
        players: userIds.map(userId => ({ userId })),
        hands,
        drawPile: deck,
        discard: [starter],
        activeSuit: starter.suit as ChromaSuit,
        direction: 1,
        stage: 'play',
        pendingColorUserId: null,
        pendingVictimDraws: 0,
        pendingSkip: false,
        turnUserId: userIds[0]!,
        drawnIndex: null,
        eliminated: [],
        timeouts: Object.fromEntries(userIds.map(id => [id, 0])),
        online: Object.fromEntries(userIds.map(id => [id, false])),
        phase: 'play',
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

  /** Play a card from the hand (optionally arming SOLO). */
  play(
    roomId: string,
    userId: string,
    handIndex: number,
    solo: boolean,
  ): Promise<ChromaMutation<ChromaPlayedPayload>> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertTurn(match, userId, 'play');
      const hand = match.hands[userId]!;
      const card = hand[handIndex];
      if (!card) {
        throw new ConflictException('No such card in your hand.');
      }
      if (match.drawnIndex !== null && handIndex !== match.drawnIndex) {
        throw new ConflictException(
          'After drawing you may only play the drawn card (or pass).',
        );
      }
      const top = match.discard[match.discard.length - 1]!;
      if (!isPlayable(card, match.activeSuit, top.value)) {
        throw new ConflictException('That card cannot be played now.');
      }

      const changedHands: Record<string, ChromaCard[]> = {};
      hand.splice(handIndex, 1);
      match.discard.push(card);
      match.drawnIndex = null;
      changedHands[userId] = [...hand];

      // Deterministic SOLO: going down to one card without arming costs
      // SOLO_PENALTY_DRAWS immediately.
      let soloPenaltyDraws = 0;
      if (hand.length === 1 && !solo) {
        soloPenaltyDraws = this.drawInto(match, userId, SOLO_PENALTY_DRAWS);
        changedHands[userId] = [...match.hands[userId]!];
      }

      const effect = playEffect(card, this.activeSeatCount(match));
      let winnerUserId: string | null = null;

      if (hand.length === 0) {
        // Winning play resolves immediately - no colour pick needed; forced
        // draws still land on the victim (official behavior).
        if (effect.victimDraws > 0) {
          const victim = this.seatUserAt(match, this.stepFrom(match, userId, 1));
          this.drawInto(match, victim, effect.victimDraws);
          changedHands[victim] = [...match.hands[victim]!];
        }
        this.endMatch(match, userId, 'complete');
        winnerUserId = userId;
      } else if (effect.needsColorPick) {
        match.stage = 'pick-color';
        match.pendingColorUserId = userId;
        match.pendingVictimDraws = effect.victimDraws;
        match.pendingSkip = effect.skipsNext;
        this.restartTurnClock(match);
      } else {
        match.activeSuit = card.suit as ChromaSuit;
        if (effect.flipsDirection) {
          match.direction = (match.direction * -1) as ChromaDirection;
        }
        if (effect.victimDraws > 0) {
          const victim = this.seatUserAt(match, this.stepFrom(match, userId, 1));
          this.drawInto(match, victim, effect.victimDraws);
          changedHands[victim] = [...match.hands[victim]!];
        }
        this.advanceTurn(match, effect.skipsNext ? 2 : 1);
      }

      await this.persist(match);
      if (!winnerUserId) {
        await this.scheduleTurnDeadline(match);
      }

      return {
        payload: {
          byUserId: userId,
          card,
          soloCalled: solo && match.hands[userId]!.length === 1,
          soloPenaltyDraws,
          ...this.tableState(match),
        },
        changedHands,
      };
    });
  }

  /** Resolve a wild's colour pick and its deferred effects. */
  pickColor(
    roomId: string,
    userId: string,
    suit: ChromaSuit,
  ): Promise<ChromaMutation<ChromaColorPickedPayload>> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      if (match.phase !== 'play' || match.stage !== 'pick-color') {
        throw new ConflictException('No colour pick is pending.');
      }
      if (match.pendingColorUserId !== userId) {
        throw new ConflictException('The colour pick is not yours.');
      }
      const mutation = this.resolveColorPick(match, suit);
      await this.persist(match);
      await this.scheduleTurnDeadline(match);
      return mutation;
    });
  }

  /** Draw one card; drawer stays on turn only if the card is playable. */
  draw(
    roomId: string,
    userId: string,
  ): Promise<ChromaMutation<ChromaDrewPayload>> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertTurn(match, userId, 'play');
      if (match.drawnIndex !== null) {
        throw new ConflictException('You already drew this turn.');
      }
      const drew = this.drawInto(match, userId, 1);
      const hand = match.hands[userId]!;
      const drawn = drew > 0 ? hand[hand.length - 1]! : null;
      const top = match.discard[match.discard.length - 1]!;
      const mayAct =
        drawn !== null && isPlayable(drawn, match.activeSuit, top.value);
      if (mayAct) {
        match.drawnIndex = hand.length - 1;
        this.restartTurnClock(match);
      } else {
        this.advanceTurn(match, 1);
      }
      await this.persist(match);
      await this.scheduleTurnDeadline(match);
      return {
        payload: {
          byUserId: userId,
          count: drew,
          drawerMayAct: mayAct,
          ...this.tableState(match),
        },
        changedHands: { [userId]: [...hand] },
      };
    });
  }

  /** Keep the drawn card and end the turn. */
  pass(
    roomId: string,
    userId: string,
  ): Promise<ChromaMutation<ChromaPassedPayload>> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertTurn(match, userId, 'play');
      if (match.drawnIndex === null) {
        throw new ConflictException('You can only pass after drawing.');
      }
      this.advanceTurn(match, 1);
      await this.persist(match);
      await this.scheduleTurnDeadline(match);
      return {
        payload: { byUserId: userId, ...this.tableState(match) },
        changedHands: {},
      };
    });
  }

  /**
   * The turn clock ran out. A pending colour pick auto-resolves to the
   * picker's strongest colour; otherwise the idle player force-draws one
   * card and the turn passes. MAX_TIMEOUTS eliminates the player (their
   * cards shuffle under the draw pile); last seat standing wins.
   */
  timeoutTurn(
    roomId: string,
    seq: number,
  ): Promise<ChromaMutation<ChromaTurnTimeoutPayload> | null> {
    return this.locked(roomId, async () => {
      const match = await this.load(roomId);
      if (!match || match.phase !== 'play' || match.turnSeq !== seq) {
        return null;
      }
      const timedOutUserId =
        match.stage === 'pick-color'
          ? match.pendingColorUserId!
          : match.turnUserId;
      match.timeouts[timedOutUserId] =
        (match.timeouts[timedOutUserId] ?? 0) + 1;

      const changedHands: Record<string, ChromaCard[]> = {};
      let forcedDraws = 0;

      if (match.stage === 'pick-color') {
        const auto = chooseBotColor(match.hands[timedOutUserId] ?? []);
        const { changedHands: picked } = this.resolveColorPick(match, auto);
        Object.assign(changedHands, picked);
      } else {
        forcedDraws = this.drawInto(match, timedOutUserId, 1);
        if (forcedDraws > 0) {
          changedHands[timedOutUserId] = [...match.hands[timedOutUserId]!];
        }
        this.advanceTurn(match, 1);
      }

      let eliminatedUserId: string | null = null;
      if (match.timeouts[timedOutUserId]! >= MAX_TIMEOUTS) {
        eliminatedUserId = timedOutUserId;
        this.eliminate(match, timedOutUserId, 'timeout');
      }

      await this.persist(match);
      if (match.phase === 'play') {
        await this.scheduleTurnDeadline(match);
      }
      return {
        payload: {
          timedOutUserId,
          timeouts: { ...match.timeouts },
          forcedDraws,
          eliminatedUserId,
          ...this.tableState(match),
        },
        changedHands,
      };
    });
  }

  /** A player leaves mid-match: eliminated; last seat standing wins. */
  forfeit(
    roomId: string,
    userId: string,
  ): Promise<ChromaMutation<ChromaEliminatedPayload>> {
    return this.locked(roomId, async () => {
      const match = await this.require(roomId);
      this.assertParticipant(match, userId);
      if (match.phase !== 'play') {
        throw new ConflictException('The match is not in play.');
      }
      if (match.eliminated.includes(userId)) {
        throw new ConflictException('You are already out of this match.');
      }
      this.eliminate(match, userId, 'forfeit');
      await this.persist(match);
      if (match.phase === 'play') {
        await this.scheduleTurnDeadline(match);
      }
      return {
        payload: { userId, ...this.tableState(match) },
        changedHands: {},
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

  /** Personalized snapshot: own hand in full, everyone else as counts. */
  async stateFor(roomId: string, userId: string): Promise<ChromaRoomState> {
    const match = await this.require(roomId);
    this.assertParticipant(match, userId);
    const table = this.tableState(match);
    return {
      roomId,
      phase: match.phase,
      players: match.players,
      myHand: [...(match.hands[userId] ?? [])],
      handCounts: table.handCounts,
      discardTop: table.discardTop,
      activeSuit: match.activeSuit,
      direction: match.direction,
      drawPileCount: match.drawPile.length,
      stage: match.stage,
      pendingColorUserId: match.pendingColorUserId,
      turnUserId: match.phase === 'over' ? null : match.turnUserId,
      myDrawnIndex:
        match.turnUserId === userId && match.phase === 'play'
          ? match.drawnIndex
          : null,
      eliminatedUserIds: [...match.eliminated],
      timeouts: { ...match.timeouts },
      online: { ...match.online },
      winnerUserId: match.winnerUserId,
      endReason: match.endReason,
      turnDeadline: match.phase === 'play' ? this.deadline(match) : null,
    };
  }

  async remove(roomId: string): Promise<void> {
    await this.cacheService.del(CacheKeys.chromaMatch(roomId));
  }

  // --- internals ---------------------------------------------------------------

  /** Apply a colour pick: deferred victim draws/skip land, turn advances. */
  private resolveColorPick(
    match: ChromaMatchState,
    suit: ChromaSuit,
  ): ChromaMutation<ChromaColorPickedPayload> {
    const byUserId = match.pendingColorUserId!;
    match.activeSuit = suit;
    match.stage = 'play';
    match.pendingColorUserId = null;

    const changedHands: Record<string, ChromaCard[]> = {};
    let victimUserId: string | null = null;
    const victimDraws = match.pendingVictimDraws;
    if (victimDraws > 0) {
      victimUserId = this.seatUserAt(match, this.stepFrom(match, byUserId, 1));
      this.drawInto(match, victimUserId, victimDraws);
      changedHands[victimUserId] = [...match.hands[victimUserId]!];
    }
    const steps = match.pendingSkip ? 2 : 1;
    match.pendingVictimDraws = 0;
    match.pendingSkip = false;
    this.advanceTurnFrom(match, byUserId, steps);

    return {
      payload: {
        byUserId,
        suit,
        victimUserId,
        victimDraws,
        ...this.tableState(match),
      },
      changedHands,
    };
  }

  /** Draw up to `count` cards into a hand, reshuffling the discard (minus its
   *  top) when the pile runs dry. Returns how many actually landed. */
  private drawInto(
    match: ChromaMatchState,
    userId: string,
    count: number,
  ): number {
    let drawn = 0;
    for (let i = 0; i < count; i++) {
      if (match.drawPile.length === 0) {
        if (match.discard.length <= 1) {
          break; // Both piles exhausted - the draw silently fizzles.
        }
        const top = match.discard.pop()!;
        match.drawPile = shuffle(match.discard, cryptoRand);
        match.discard = [top];
      }
      match.hands[userId]!.push(match.drawPile.pop()!);
      drawn++;
    }
    return drawn;
  }

  private activeSeatCount(match: ChromaMatchState): number {
    return match.players.length - match.eliminated.length;
  }

  private seatIndexOf(match: ChromaMatchState, userId: string): number {
    return match.players.findIndex(p => p.userId === userId);
  }

  private seatUserAt(match: ChromaMatchState, index: number): string {
    return match.players[index]!.userId;
  }

  private eliminatedIndexes(match: ChromaMatchState): Set<number> {
    return new Set(
      match.eliminated.map(id => this.seatIndexOf(match, id)),
    );
  }

  /** The seat index `steps` along from a user, honouring direction/eliminations. */
  private stepFrom(
    match: ChromaMatchState,
    fromUserId: string,
    steps: number,
  ): number {
    return nextSeatIndex(
      match.players.length,
      this.seatIndexOf(match, fromUserId),
      match.direction,
      this.eliminatedIndexes(match),
      steps,
    );
  }

  private advanceTurn(match: ChromaMatchState, steps: number): void {
    this.advanceTurnFrom(match, match.turnUserId, steps);
  }

  private advanceTurnFrom(
    match: ChromaMatchState,
    fromUserId: string,
    steps: number,
  ): void {
    match.turnUserId = this.seatUserAt(match, this.stepFrom(match, fromUserId, steps));
    match.drawnIndex = null;
    this.restartTurnClock(match);
  }

  /** Remove a player: cards shuffle under the draw pile; last standing wins;
   *  a pending pick or held turn moves on. */
  private eliminate(
    match: ChromaMatchState,
    userId: string,
    reason: ChromaEndReason,
  ): void {
    const wasTheirTurn = match.turnUserId === userId;
    const ownedPick = match.pendingColorUserId === userId;
    match.eliminated = [...match.eliminated, userId];
    const hand = match.hands[userId]!;
    match.hands[userId] = [];
    match.drawPile = shuffle([...hand, ...match.drawPile], cryptoRand);

    if (ownedPick) {
      // Their wild resolves to their strongest colour so play can continue.
      this.resolveColorPick(match, chooseBotColor(hand));
    }

    const standing = match.players.filter(
      p => !match.eliminated.includes(p.userId),
    );
    if (standing.length === 1) {
      this.endMatch(match, standing[0]!.userId, reason);
      return;
    }
    if (wasTheirTurn && !ownedPick) {
      this.advanceTurnFrom(match, userId, 1);
    } else if (!ownedPick) {
      this.restartTurnClock(match);
    }
  }

  private endMatch(
    match: ChromaMatchState,
    winnerUserId: string,
    reason: ChromaEndReason,
  ): void {
    match.phase = 'over';
    match.winnerUserId = winnerUserId;
    match.endReason = reason;
    match.turnUserId = winnerUserId;
    match.stage = 'play';
    match.pendingColorUserId = null;
  }

  private tableState(match: ChromaMatchState): ChromaTableState {
    return {
      handCounts: Object.fromEntries(
        match.players.map(p => [p.userId, match.hands[p.userId]!.length]),
      ),
      discardTop: match.discard[match.discard.length - 1]!,
      activeSuit: match.activeSuit,
      direction: match.direction,
      drawPileCount: match.drawPile.length,
      stage: match.stage,
      pendingColorUserId: match.pendingColorUserId,
      nextTurnUserId: match.turnUserId,
      turnDeadline: this.deadline(match),
      winnerUserId: match.winnerUserId,
    };
  }

  // --- cache plumbing ----------------------------------------------------------

  private locked<T>(roomId: string, fn: () => Promise<T>): Promise<T> {
    return this.cacheService.withLock(
      CacheKeys.chromaLock(roomId),
      MATCH_LOCK_TTL_MS,
      fn,
    );
  }

  private load(roomId: string): Promise<ChromaMatchState | null> {
    return this.cacheService.getJson<ChromaMatchState>(
      CacheKeys.chromaMatch(roomId),
    );
  }

  private persist(match: ChromaMatchState): Promise<void> {
    return this.cacheService.setJson(
      CacheKeys.chromaMatch(match.roomId),
      match,
      MATCH_TTL_SECONDS,
    );
  }

  private restartTurnClock(match: ChromaMatchState): void {
    match.turnStartedAt = Date.now();
    match.turnSeq += 1;
  }

  private scheduleTurnDeadline(match: ChromaMatchState): Promise<void> {
    if (match.phase !== 'play') {
      return Promise.resolve();
    }
    return this.cacheService.addDeadline(
      deadlineMember(match.roomId, 'chroma-turn', match.turnSeq),
      this.deadline(match),
    );
  }

  private deadline(match: ChromaMatchState): number {
    return (match.turnStartedAt ?? Date.now()) + TURN_SECONDS * 1000;
  }

  private async require(roomId: string): Promise<ChromaMatchState> {
    const match = await this.load(roomId);
    if (!match) {
      throw new NotFoundException('Match not found.');
    }
    return match;
  }

  private assertParticipant(match: ChromaMatchState, userId: string): void {
    if (!match.players.some(p => p.userId === userId)) {
      throw new ForbiddenException('You are not part of this match.');
    }
  }

  private assertTurn(
    match: ChromaMatchState,
    userId: string,
    stage: ChromaStage,
  ): void {
    this.assertParticipant(match, userId);
    if (match.phase !== 'play') {
      throw new ConflictException('The match is not in play.');
    }
    if (match.turnUserId !== userId) {
      throw new ConflictException('It is not your turn.');
    }
    if (match.stage !== stage) {
      throw new ConflictException('A colour pick is pending.');
    }
  }
}
