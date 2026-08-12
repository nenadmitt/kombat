import {
  ABILITY_COST_HP,
  GameRoomStatus,
  GameType,
  LUDO_EVENTS,
  MAX_TIMEOUTS,
  ROOM_EVENTS,
  type LudoEndedPayload,
  type LudoMovedPayload,
  type LudoRolledPayload,
  type LudoRoomState,
  type LudoTurnTimeoutPayload,
} from '@gaming-platform/core';

import { GameRoomEntity } from '../src/db/entities/game-room.entity';
import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';
import {
  subscribe,
  waitFor,
  waitForOrError,
  waitUntil,
} from './harness/events';
import { expireCurrentTurn, expireDeadline, readMatch } from './harness/clock';

/** A pawn here has no legal five and a pawn in base needs a six, so a seat
 *  parked on it can roll without moving anything. */
const PARKED_PROGRESS = 55;
const PARK_ROLLS = PARKED_PROGRESS / 5;

/**
 * Same trick as the battleship timeout suite: rewrite the scheduled deadline
 * into the past and let the real GameDeadlineSweeper pick it up on its next
 * tick, so what runs is the production enforcement path rather than a
 * shortened TURN_SECONDS.
 */
describe('ludo timeouts (e2e)', () => {
  let testApp: TestApp;
  let actors: Actor[];
  let host: Actor;
  let joiner: Actor;
  let roomId: string;

  const actor = async (label: string): Promise<Actor> => {
    const created = await createActor(testApp, label);
    actors.push(created);
    return created;
  };

  const matchState = async (who: Actor): Promise<LudoRoomState> => {
    const { body } = await who.get<LudoRoomState>(
      `/games/rooms/${roomId}/state`,
    );
    return body;
  };

  const startMatch = async (...joiners: Actor[]): Promise<void> => {
    const { body: room } = await host.post('/games/rooms', {
      gameType: GameType.Ludo,
    });
    roomId = room.id;
    for (const seat of joiners) {
      await seat.post(`/games/rooms/${roomId}/join`);
    }
    for (const seat of [host, ...joiners]) {
      await subscribe(seat.socket, `game:${roomId}`);
    }
    const started = waitFor(host.socket, ROOM_EVENTS.started);
    await host.post(`/games/rooms/${roomId}/start`);
    await started;

    for (const seat of [host, ...joiners]) {
      seat.socket.emit(LUDO_EVENTS.enter, { roomId });
    }
    expect(await matchState(host)).toMatchObject({ turnUserId: host.userId });
  };

  /** Every broadcast names its author, which is what keeps a seat from
   *  mistaking another seat's pending event for its own answer. */
  const byActor =
    (who: Actor) =>
    (payload: { byUserId: string }): boolean =>
      payload.byUserId === who.userId;

  const roll = (who: Actor, die: number): Promise<LudoRolledPayload> => {
    testApp.dice.queue(die);
    const rolled = waitForOrError<LudoRolledPayload>(
      who.socket,
      LUDO_EVENTS.rolled,
      LUDO_EVENTS.error,
      { where: byActor(who) },
    );
    who.socket.emit(LUDO_EVENTS.roll, { roomId });
    return rolled;
  };

  const move = (who: Actor, tokenIndex: number): Promise<LudoMovedPayload> => {
    const moved = waitForOrError<LudoMovedPayload>(
      who.socket,
      LUDO_EVENTS.moved,
      LUDO_EVENTS.error,
      { where: byActor(who) },
    );
    who.socket.emit(LUDO_EVENTS.move, { roomId, tokenIndex });
    return moved;
  };

  const cast = <T extends { byUserId: string }>(
    who: Actor,
    action: string,
    result: string,
    tokenIndex: number,
  ): Promise<T> => {
    const done = waitForOrError<T>(who.socket, result, LUDO_EVENTS.error, {
      where: byActor(who),
    });
    who.socket.emit(action, { roomId, tokenIndex });
    return done;
  };

  /** Hand the turn on with a five: it walks a pawn that is still on the
   *  track, and does nothing at all once the seat is parked. */
  const pass = async (who: Actor): Promise<void> => {
    const rolled = await roll(who, 5);
    if (rolled.movableTokens.length > 0) {
      await move(who, rolled.movableTokens[0]!);
    }
  };

  /** Every seat walks its opening pawn to the last home-column square in
   *  lockstep - from there a five moves nothing, so the board holds still and
   *  every further roll is pure charge. */
  const parkOpeningPawns = async (seats: Actor[]): Promise<void> => {
    for (let step = 0; step < PARK_ROLLS; step++) {
      for (const seat of seats) {
        await roll(seat, 5);
        await move(seat, 0);
      }
    }
  };

  const bankCharge = async (seats: Actor[], rounds: number): Promise<void> => {
    for (let round = 0; round < rounds; round++) {
      for (const seat of seats) {
        await roll(seat, 5);
      }
    }
  };

  /** Walks the host's opening pawn up to `goal`; the joiner walks alongside
   *  on fives until it parks. */
  const walkTo = async (goal: number): Promise<void> => {
    let at = 0;
    while (at < goal) {
      await roll(host, Math.min(goal - at, 5));
      const moved = await move(host, 0);
      at = moved.toProgress;
      if (moved.nextTurnUserId !== host.userId) {
        await pass(joiner);
      }
    }
  };

  /** Expire the turn on the clock and wait for the sweeper to enforce it. */
  const timeOutTurn = async (
    watcher: Actor,
  ): Promise<LudoTurnTimeoutPayload> => {
    const timedOut = waitFor<LudoTurnTimeoutPayload>(
      watcher.socket,
      LUDO_EVENTS.turnTimeout,
      10_000,
    );
    await expireCurrentTurn(testApp, roomId, 'ludo');
    return timedOut;
  };

  const turnSeq = async (): Promise<number> => {
    const match = await readMatch(testApp, roomId, 'ludo');
    return match!.turnSeq;
  };

  const settle = (ms = 1_500): Promise<unknown> =>
    new Promise(resolve => setTimeout(resolve, ms));

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    actors = [];
    testApp.dice.reset();
    await testApp.truncate();
    host = await actor('host');
    joiner = await actor('joiner');
  });

  afterEach(() => {
    actors.forEach(a => a.disconnect());
  });

  describe('the turn clock', () => {
    it('hands the turn to the next seat and re-arms the clock', async () => {
      await startMatch(joiner);
      const before = await turnSeq();

      const timedOut = await timeOutTurn(joiner);

      expect(timedOut).toMatchObject({
        timedOutUserId: host.userId,
        nextTurnUserId: joiner.userId,
        timeouts: { [host.userId]: 1, [joiner.userId]: 0 },
        eliminatedColor: null,
        winnerUserId: null,
      });
      expect(await turnSeq()).toBeGreaterThan(before);
    });

    it('drops a deadline for a turn that already moved on', async () => {
      await startMatch(joiner);
      const stale = await turnSeq();

      await roll(host, 3);
      await move(host, 0);
      await expireDeadline(testApp, roomId, 'ludo-turn', stale);
      await settle();

      const match = await readMatch(testApp, roomId, 'ludo');
      expect(match).toMatchObject({ phase: 'play' });
      expect(match!.timeouts[host.userId]).toBe(0);
      expect(match!.timeouts[joiner.userId]).toBe(0);
    });
  });

  describe('elimination', () => {
    it('drops the third-timeout player and plays on with the rest', async () => {
      const third = await actor('third');
      await startMatch(joiner, third);
      const seats = [host, joiner, third];

      await parkOpeningPawns(seats);
      await bankCharge(
        seats,
        ABILITY_COST_HP.jump + ABILITY_COST_HP.shield - PARK_ROLLS,
      );
      await cast(host, LUDO_EVENTS.jump, LUDO_EVENTS.jumped, 1);
      await cast(host, LUDO_EVENTS.shield, LUDO_EVENTS.shielded, 2);
      await roll(host, 6);
      await move(host, 1);

      let timedOut!: LudoTurnTimeoutPayload;
      for (let i = 0; i < MAX_TIMEOUTS * seats.length - 2; i++) {
        timedOut = await timeOutTurn(joiner);
      }

      expect(timedOut).toMatchObject({
        timedOutUserId: host.userId,
        eliminatedColor: 'red',
        nextTurnUserId: joiner.userId,
        jumps: {},
        shields: {},
        winnerUserId: null,
      });
      expect(timedOut.tokens.red).toEqual([-1, -1, -1, -1]);
      expect(timedOut.timeouts[host.userId]).toBe(MAX_TIMEOUTS);

      const state = await matchState(joiner);
      expect(state).toMatchObject({
        phase: 'play',
        eliminated: ['red'],
        turnUserId: joiner.userId,
      });
      await expect(roll(joiner, 3)).resolves.toMatchObject({
        nextTurnUserId: third.userId,
      });
    });

    it('settles the match once eliminations leave one seat standing', async () => {
      await startMatch(joiner);

      for (let i = 0; i < MAX_TIMEOUTS * 2 - 2; i++) {
        await timeOutTurn(joiner);
      }
      const ended = waitFor<LudoEndedPayload>(
        joiner.socket,
        LUDO_EVENTS.ended,
        10_000,
      );
      const last = await timeOutTurn(joiner);

      expect(last).toMatchObject({
        timedOutUserId: host.userId,
        eliminatedColor: 'red',
        winnerUserId: joiner.userId,
      });
      expect(await ended).toEqual({
        winnerUserId: joiner.userId,
        reason: 'timeout',
      });
      expect(await readMatch(testApp, roomId, 'ludo')).toMatchObject({
        phase: 'over',
        winnerUserId: joiner.userId,
        endReason: 'timeout',
      });

      const room = await waitUntil(async () => {
        const found = await testApp.dataSource
          .getRepository(GameRoomEntity)
          .findOneBy({ id: roomId });
        return found?.status === GameRoomStatus.Completed ? found : null;
      }, 10_000);
      expect(room).toMatchObject({
        winnerUserId: joiner.userId,
        endReason: 'timeout',
      });
    });
  });

  describe('abilities and the clock', () => {
    it('leaves the running clock alone when a cast keeps the turn', async () => {
      await startMatch(joiner);
      await parkOpeningPawns([host, joiner]);
      const armed = await turnSeq();

      await cast(host, LUDO_EVENTS.shield, LUDO_EVENTS.shielded, 1);

      expect(await turnSeq()).toBe(armed);
      const timedOut = waitFor<LudoTurnTimeoutPayload>(
        joiner.socket,
        LUDO_EVENTS.turnTimeout,
        10_000,
      );
      await expireDeadline(testApp, roomId, 'ludo-turn', armed);
      expect(await timedOut).toMatchObject({ timedOutUserId: host.userId });
    });

    it('re-arms the clock when a cast passes the turn on', async () => {
      await startMatch(joiner);
      await walkTo(40);
      await roll(host, 5);
      const armed = await turnSeq();

      await cast(host, LUDO_EVENTS.launch, LUDO_EVENTS.launched, 0);

      expect(await turnSeq()).toBe(armed + 1);
      await expireDeadline(testApp, roomId, 'ludo-turn', armed);
      await settle();

      const match = await readMatch(testApp, roomId, 'ludo');
      expect(match).toMatchObject({ phase: 'play', turnUserId: joiner.userId });
      expect(match!.timeouts[host.userId]).toBe(0);
      expect(match!.timeouts[joiner.userId]).toBe(0);
    });
  });
});
