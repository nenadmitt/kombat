import {
  ABILITY_COST_HP,
  ABILITY_MAX_USES,
  CAPTURE_HP,
  CHARGE_MAX_HP,
  GameRoomStatus,
  GameType,
  HOME_ARRIVAL_HP,
  LAUNCH_DISTANCE,
  LUDO_EVENTS,
  ROOM_EVENTS,
  STAR_LANDING_HP,
  type LudoAbilityStatePayload,
  type LudoEliminatedPayload,
  type LudoEndedPayload,
  type LudoJumpedPayload,
  type LudoLaunchedPayload,
  type LudoMovedPayload,
  type LudoRolledPayload,
  type LudoRoomState,
  type LudoShieldedPayload,
  type LudoTeleportedPayload,
  type MatchHistoryEntry,
} from '@gaming-platform/core';

import { GameRoomEntity } from '../src/db/entities/game-room.entity';
import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';
import {
  collect,
  expectNoEvent,
  subscribe,
  waitFor,
  waitForOrError,
  waitUntil,
} from './harness/events';

/** A pawn here has no legal five (it would overshoot home) and a pawn in base
 *  needs a six, so a seat parked on it can roll without moving anything. */
const PARKED_PROGRESS = 55;
const PARK_ROLLS = PARKED_PROGRESS / 5;

/**
 * The die is scripted (`testApp.dice`), so every case reads as the sequence of
 * rolls it actually is. Seats are colored in join order: the creator is red
 * (track offset 0), the first joiner green (offset 13), and a token's
 * progress plus its offset is the shared-track cell it stands on - which is
 * what makes captures and star fields plannable here.
 */
describe('ludo match (e2e)', () => {
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

  const createRoom = async (): Promise<void> => {
    const { body } = await host.post('/games/rooms', {
      gameType: GameType.Ludo,
    });
    roomId = body.id;
  };

  const matchState = async (who: Actor): Promise<LudoRoomState> => {
    const { body } = await who.get<LudoRoomState>(
      `/games/rooms/${roomId}/state`,
    );
    return body;
  };

  /** A room the creator starts early, every seat subscribed and entered. The
   *  fourth joiner would start it on the join instead. */
  const startMatch = async (...joiners: Actor[]): Promise<void> => {
    await createRoom();
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
    expect(await matchState(host)).toMatchObject({
      phase: 'play',
      turnUserId: host.userId,
      stage: 'roll',
    });
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

  const refuse = async (
    who: Actor,
    action: string,
    body: unknown,
  ): Promise<string> => {
    const error = waitFor<{ message: string }>(who.socket, LUDO_EVENTS.error);
    who.socket.emit(action, body);
    return (await error).message;
  };

  /** Hand the turn on with a five: it walks a pawn that is still on the
   *  track, and does nothing at all once the seat is parked. */
  const pass = async (who: Actor): Promise<void> => {
    const rolled = await roll(who, 5);
    if (rolled.movableTokens.length > 0) {
      await move(who, rolled.movableTokens[0]!);
    }
  };

  /**
   * Walks every seat's opening pawn to PARKED_PROGRESS in lockstep. The seats
   * keep their fixed offsets apart the whole way, so nobody lands on anybody,
   * and once parked the board holds still.
   */
  const parkOpeningPawns = async (seats: Actor[]): Promise<void> => {
    for (let step = 0; step < PARK_ROLLS; step++) {
      for (const seat of seats) {
        await roll(seat, 5);
        await move(seat, 0);
      }
    }
  };

  /** Parked seats rolling fives: nothing is movable, so the turn just passes
   *  and each roll is pure charge. */
  const bankCharge = async (seats: Actor[], rounds: number): Promise<void> => {
    for (let round = 0; round < rounds; round++) {
      for (const seat of seats) {
        const rolled = await roll(seat, 5);
        expect(rolled.movableTokens).toEqual([]);
      }
    }
  };

  /** Parked, with a full bar and three pawns still in base. */
  const fillBar = async (seats: Actor[]): Promise<void> => {
    await parkOpeningPawns(seats);
    await bankCharge(seats, CHARGE_MAX_HP - PARK_ROLLS);
  };

  /**
   * Walks the host's pawns forward one at a time until each reaches its goal
   * (a goal of -1 leaves that pawn in base), and hands the turn back to the
   * host. The joiner walks alongside on fives until it parks.
   */
  const walk = async (goals: number[]): Promise<void> => {
    let red = (await matchState(host)).tokens.red!;
    for (;;) {
      const index = goals.findIndex((goal, i) => red[i]! < goal);
      if (index < 0) {
        return;
      }
      const at = red[index]!;
      const rolled = await roll(
        host,
        at < 0 ? 6 : Math.min(goals[index]! - at, 5),
      );
      expect(rolled.movableTokens).toContain(index);
      const moved = await move(host, index);
      red = moved.tokens.red!;
      if (!moved.winnerUserId && moved.nextTurnUserId !== host.userId) {
        await pass(joiner);
      }
    }
  };

  const completedRoom = (): Promise<GameRoomEntity> =>
    waitUntil(async () => {
      const found = await testApp.dataSource
        .getRepository(GameRoomEntity)
        .findOneBy({ id: roomId });
      return found?.status === GameRoomStatus.Completed ? found : null;
    });

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

  describe('the room', () => {
    it('starts a four-seat room only once every seat is taken', async () => {
      await createRoom();
      const second = await actor('second');
      const third = await actor('third');
      await second.post(`/games/rooms/${roomId}/join`);

      const silence = expectNoEvent(host.socket, ROOM_EVENTS.started);
      await joiner.post(`/games/rooms/${roomId}/join`);
      await silence;
      const rooms = testApp.dataSource.getRepository(GameRoomEntity);
      expect(await rooms.findOneBy({ id: roomId })).toMatchObject({
        status: GameRoomStatus.Pending,
      });

      const started = waitFor(host.socket, ROOM_EVENTS.started);
      await third.post(`/games/rooms/${roomId}/join`);

      expect(await started).toEqual({ roomId });
      expect(await rooms.findOneBy({ id: roomId })).toMatchObject({
        status: GameRoomStatus.InProgress,
      });
    });

    it('lets the creator start early with a partial table', async () => {
      await createRoom();
      await joiner.post(`/games/rooms/${roomId}/join`);

      const started = waitFor(joiner.socket, ROOM_EVENTS.started);
      const { status } = await host.post(`/games/rooms/${roomId}/start`);

      expect(status).toBe(201);
      expect(await started).toEqual({ roomId });
    });

    it('refuses an early start before anyone has joined', async () => {
      await createRoom();

      const { status, body } = await host.post(`/games/rooms/${roomId}/start`);

      expect(status).toBe(409);
      expect(body.message).toContain('At least one other player');
    });

    it('refuses an early start from anyone but the creator', async () => {
      await createRoom();
      await joiner.post(`/games/rooms/${roomId}/join`);

      const { status, body } = await joiner.post(
        `/games/rooms/${roomId}/start`,
      );

      expect(status).toBe(403);
      expect(body.message).toContain('Only the room creator');
    });

    it('refuses a fifth player', async () => {
      await createRoom();
      const second = await actor('second');
      const third = await actor('third');
      const fifth = await actor('fifth');
      for (const seat of [joiner, second, third]) {
        await seat.post(`/games/rooms/${roomId}/join`);
      }

      const { status, body } = await fifth.post(`/games/rooms/${roomId}/join`);

      expect(status).toBe(409);
      expect(body.message).toContain('no longer accepting players');
    });

    it('keeps a non-participant out of the match', async () => {
      await startMatch(joiner);
      const outsider = await actor('outsider');

      const { status } = await outsider.get(`/games/rooms/${roomId}/state`);
      expect(status).toBe(403);

      const message = await refuse(outsider, LUDO_EVENTS.roll, { roomId });
      expect(message).toContain('not part of this room');
    });
  });

  describe('turns', () => {
    beforeEach(async () => {
      await startMatch(joiner);
    });

    it('opens with a pawn already on its start cell', async () => {
      const opening = await matchState(host);
      expect(opening.tokens.red).toEqual([0, -1, -1, -1]);
      expect(opening.tokens.green).toEqual([0, -1, -1, -1]);
      expect(opening.chargeHp).toEqual({
        [host.userId]: 0,
        [joiner.userId]: 0,
      });

      const rolled = await roll(host, 3);
      expect(rolled.movableTokens).toEqual([0]);
      const moved = await move(host, 0);

      expect(moved).toMatchObject({
        fromProgress: 0,
        toProgress: 3,
        nextTurnUserId: joiner.userId,
      });
      expect(moved.chargeHp[host.userId]).toBe(0);
    });

    it('still needs a six to release a pawn from base', async () => {
      await roll(host, 3);
      await move(host, 0);
      await pass(joiner);

      const four = await roll(host, 4);
      expect(four.movableTokens).toEqual([0]);
      await move(host, 0);
      await pass(joiner);

      const six = await roll(host, 6);
      expect(six.movableTokens).toEqual([0, 1, 2, 3]);
      const released = await move(host, 1);

      expect(released).toMatchObject({
        fromProgress: -1,
        toProgress: 0,
        extraRoll: true,
        nextTurnUserId: host.userId,
      });
    });

    it('forfeits the turn on a third six', async () => {
      await roll(host, 6);
      await move(host, 0);
      await roll(host, 6);
      await move(host, 0);

      const third = await roll(host, 6);

      expect(third).toMatchObject({
        sixChain: 3,
        thirdSix: true,
        movableTokens: [],
        stage: 'roll',
        nextTurnUserId: joiner.userId,
      });
    });

    it('passes the turn when the roll moves nothing', async () => {
      await parkOpeningPawns([host, joiner]);

      const rolled = await roll(host, 5);

      expect(rolled).toMatchObject({
        movableTokens: [],
        stage: 'roll',
        nextTurnUserId: joiner.userId,
      });
    });

    it('sends a captured pawn home and pays for the capture', async () => {
      await roll(host, 5);
      await move(host, 0);
      await roll(joiner, 3);
      await move(joiner, 0);

      await roll(host, 6);
      await move(host, 0);
      // Red 11 + 5 = 16, and green's pawn on its own progress 3 stands on that
      // same shared cell (green starts 13 further along the track).
      const rolled = await roll(host, 5);
      const moved = await move(host, 0);

      expect(moved.captures).toEqual([{ color: 'green', tokenIndex: 0 }]);
      expect(moved.captureCounts[host.userId]).toBe(1);
      expect(moved.tokens.green![0]).toBe(-1);
      expect(moved.tokens.red![0]).toBe(16);
      expect(moved.chargeHp[host.userId]).toBe(
        rolled.chargeHp[host.userId]! + CAPTURE_HP,
      );
    });
  });

  describe('charge', () => {
    beforeEach(async () => {
      await startMatch(joiner);
    });

    it('banks a half point on a five and a full point on a six', async () => {
      const five = await roll(host, 5);
      expect(five.chargeHp[host.userId]).toBe(1);
      await move(host, 0);
      await pass(joiner);

      const six = await roll(host, 6);

      expect(six.chargeHp[host.userId]).toBe(3);
      expect(six.stage).toBe('move');
    });

    it('pays for landing on a neutral star but not on a start cell', async () => {
      await roll(host, 3);
      const stepped = await move(host, 0);
      expect(stepped.chargeHp[host.userId]).toBe(0);
      await pass(joiner);

      const rolled = await roll(host, 5);
      expect(rolled.chargeHp[host.userId]).toBe(1);
      const starred = await move(host, 0);
      expect(starred.toProgress).toBe(8);
      expect(starred.chargeHp[host.userId]).toBe(1 + STAR_LANDING_HP);
      await pass(joiner);

      await roll(host, 6);
      const released = await move(host, 1);

      expect(released.toProgress).toBe(0);
      expect(released.chargeHp[host.userId]).toBe(1 + STAR_LANDING_HP + 2);
    });

    it('pays for banking a pawn but nothing for the teleport that sets it up', async () => {
      await fillBar([host, joiner]);
      await roll(host, 6);
      await move(host, 1);

      const teleported = await cast<LudoTeleportedPayload>(
        host,
        LUDO_EVENTS.teleport,
        LUDO_EVENTS.teleported,
        1,
      );
      expect(teleported.toProgress).toBe(51);
      expect(teleported.chargeHp[host.userId]).toBe(0);

      const rolled = await roll(host, 5);
      expect(rolled.chargeHp[host.userId]).toBe(1);
      const banked = await move(host, 1);

      expect(banked.toProgress).toBe(56);
      expect(banked.chargeHp[host.userId]).toBe(1 + HOME_ARRIVAL_HP);
    });

    it('clamps the bar at its maximum', async () => {
      await fillBar([host, joiner]);

      const rolled = await roll(host, 5);

      expect(rolled.chargeHp[host.userId]).toBe(CHARGE_MAX_HP);
    });
  });

  describe('casting abilities', () => {
    beforeEach(async () => {
      await startMatch(joiner);
    });

    it('spends the bar and the use, and tells the caster what is left', async () => {
      await fillBar([host, joiner]);

      const abilityState = waitFor<LudoAbilityStatePayload>(
        host.socket,
        LUDO_EVENTS.abilityState,
      );
      const shielded = await cast<LudoShieldedPayload>(
        host,
        LUDO_EVENTS.shield,
        LUDO_EVENTS.shielded,
        1,
      );

      expect(shielded.shields).toEqual({ red: [1] });
      expect(shielded.chargeHp[host.userId]).toBe(
        CHARGE_MAX_HP - ABILITY_COST_HP.shield,
      );
      expect(await abilityState).toEqual({
        chargeHp: CHARGE_MAX_HP - ABILITY_COST_HP.shield,
        usesLeft: { ...ABILITY_MAX_USES, shield: 0 },
      });
    });

    it('refuses a cast the bar cannot pay for', async () => {
      const message = await refuse(host, LUDO_EVENTS.shield, {
        roomId,
        tokenIndex: 1,
      });

      expect(message).toContain('Not enough ability points');
    });

    it('refuses a cast once the uses are spent', async () => {
      await fillBar([host, joiner]);
      await cast(host, LUDO_EVENTS.shield, LUDO_EVENTS.shielded, 1);

      const message = await refuse(host, LUDO_EVENTS.shield, {
        roomId,
        tokenIndex: 2,
      });

      expect(message).toContain('No uses left');
    });

    it('refuses a cast on another seat’s turn', async () => {
      const message = await refuse(joiner, LUDO_EVENTS.shield, {
        roomId,
        tokenIndex: 1,
      });

      expect(message).toContain('not your turn');
    });

    it('refuses a launcher on a pawn still in base', async () => {
      const message = await refuse(host, LUDO_EVENTS.launch, {
        roomId,
        tokenIndex: 1,
      });

      expect(message).toContain('cannot be launched');
    });

    it('refuses a launch that would stack onto an own pawn', async () => {
      await walk([LAUNCH_DISTANCE, -1, -1, -1]);
      await roll(host, 6);
      await move(host, 1);

      const message = await refuse(host, LUDO_EVENTS.launch, {
        roomId,
        tokenIndex: 1,
      });

      expect(message).toContain('cannot be launched');
    });

    it('refuses a shield on a pawn already in the home column', async () => {
      await walk([51, -1, -1, -1]);

      const message = await refuse(host, LUDO_EVENTS.shield, {
        roomId,
        tokenIndex: 0,
      });

      expect(message).toContain('cannot take a shield');
    });
  });

  describe('abilities in play', () => {
    beforeEach(async () => {
      await startMatch(joiner);
    });

    it('throws a pawn the full launch distance', async () => {
      await fillBar([host, joiner]);
      await roll(host, 6);
      await move(host, 1);

      const launched = await cast<LudoLaunchedPayload>(
        host,
        LUDO_EVENTS.launch,
        LUDO_EVENTS.launched,
        1,
      );

      expect(launched).toMatchObject({
        fromProgress: 0,
        toProgress: LAUNCH_DISTANCE,
        winnerUserId: null,
      });
      expect(launched.chargeHp[host.userId]).toBe(
        CHARGE_MAX_HP - ABILITY_COST_HP.launcher,
      );
      // The six's extra roll is still owed, so the turn stays put.
      expect(launched.turn).toMatchObject({
        stage: 'roll',
        nextTurnUserId: host.userId,
      });
    });

    it('pays for the star a launch lands on', async () => {
      await fillBar([host, joiner]);
      await roll(host, 6);
      await move(host, 1);
      // Progress 6 is the only start-of-track square a launch turns into a
      // neutral star landing.
      await roll(host, 6);
      await move(host, 1);

      const launched = await cast<LudoLaunchedPayload>(
        host,
        LUDO_EVENTS.launch,
        LUDO_EVENTS.launched,
        1,
      );

      expect(launched).toMatchObject({ fromProgress: 6, toProgress: 21 });
      expect(launched.chargeHp[host.userId]).toBe(
        CHARGE_MAX_HP - ABILITY_COST_HP.launcher + STAR_LANDING_HP,
      );
    });

    it('clamps a launch into home and pays for banking the pawn', async () => {
      await walk([45, -1, -1, -1]);
      const before = (await matchState(host)).chargeHp[host.userId]!;
      expect(before).toBe(9);

      const launched = await cast<LudoLaunchedPayload>(
        host,
        LUDO_EVENTS.launch,
        LUDO_EVENTS.launched,
        0,
      );

      expect(launched).toMatchObject({ fromProgress: 45, toProgress: 56 });
      expect(launched.tokens.red![0]).toBe(56);
      expect(launched.chargeHp[host.userId]).toBe(
        before - ABILITY_COST_HP.launcher + HOME_ARRIVAL_HP,
      );
    });

    it('pays for a pawn a launch knocks out', async () => {
      await fillBar([host, joiner]);
      await pass(host);

      // Green's pawn on its own progress 2 stands on the square a launch from
      // the red start cell lands on.
      await roll(joiner, 6);
      await move(joiner, 1);
      await roll(joiner, 2);
      await move(joiner, 1);

      await roll(host, 6);
      await move(host, 1);
      const launched = await cast<LudoLaunchedPayload>(
        host,
        LUDO_EVENTS.launch,
        LUDO_EVENTS.launched,
        1,
      );

      expect(launched).toMatchObject({ fromProgress: 0, toProgress: 15 });
      expect(launched.captures).toEqual([{ color: 'green', tokenIndex: 1 }]);
      expect(launched.captureCounts[host.userId]).toBe(1);
      expect(launched.tokens.green![1]).toBe(-1);
      expect(launched.chargeHp[host.userId]).toBe(
        CHARGE_MAX_HP - ABILITY_COST_HP.launcher + CAPTURE_HP,
      );
    });

    it('doubles the pending die for a buffed pawn', async () => {
      await fillBar([host, joiner]);
      await roll(host, 6);
      await move(host, 1);

      const jumped = await cast<LudoJumpedPayload>(
        host,
        LUDO_EVENTS.jump,
        LUDO_EVENTS.jumped,
        1,
      );
      expect(jumped.jumps).toEqual({ red: [1] });

      await roll(host, 3);
      const moved = await move(host, 1);

      expect(moved).toMatchObject({ die: 3, fromProgress: 0, toProgress: 6 });
    });

    it('keeps a shielded pawn on the board and still lets it capture', async () => {
      // Red walks up the track in fives; green banks a star on the way, which
      // is exactly what the shield costs.
      for (const greenDie of [5, 3, 5, 5, 5]) {
        await roll(host, 5);
        await move(host, 0);
        await roll(joiner, greenDie);
        await move(joiner, 0);
      }
      await roll(host, 5);
      await move(host, 0);

      const shielded = await cast<LudoShieldedPayload>(
        joiner,
        LUDO_EVENTS.shield,
        LUDO_EVENTS.shielded,
        0,
      );
      expect(shielded.shields).toEqual({ green: [0] });
      expect(shielded.chargeHp[joiner.userId]).toBe(0);
      // Sixes let green spend its turn on a pawn out of base and leave the
      // shielded one exactly where red is about to land.
      await roll(joiner, 6);
      await move(joiner, 1);
      await roll(joiner, 6);
      await move(joiner, 1);
      await roll(joiner, 6);

      const rolled = await roll(host, 6);
      const blocked = await move(host, 0);

      expect(blocked.captures).toEqual([]);
      expect(blocked.tokens.green![0]).toBe(23);
      expect(blocked.tokens.red![0]).toBe(36);
      expect(blocked.chargeHp[host.userId]).toBe(rolled.chargeHp[host.userId]);

      await roll(host, 1);
      await move(host, 0);
      const greenRoll = await roll(joiner, 1);
      const captured = await move(joiner, 0);

      expect(captured.captures).toEqual([{ color: 'red', tokenIndex: 0 }]);
      expect(captured.tokens.red![0]).toBe(-1);
      expect(captured.chargeHp[joiner.userId]).toBe(
        greenRoll.chargeHp[joiner.userId]! + CAPTURE_HP,
      );
    });

    it('re-derives the movable set when a cast lands mid-turn', async () => {
      await fillBar([host, joiner]);
      await roll(host, 6);
      await move(host, 1);
      await roll(host, 3);
      await move(host, 1);
      await pass(joiner);

      const rolled = await roll(host, 6);
      expect(rolled.movableTokens).toEqual([1, 2, 3]);

      const teleported = await cast<LudoTeleportedPayload>(
        host,
        LUDO_EVENTS.teleport,
        LUDO_EVENTS.teleported,
        1,
      );

      expect(teleported).toMatchObject({ fromProgress: 3, toProgress: 51 });
      expect(teleported.chargeHp[host.userId]).toBe(0);
      expect(teleported.turn).toMatchObject({
        stage: 'move',
        movableTokens: [2, 3],
        nextTurnUserId: host.userId,
      });
      await expect(move(host, 2)).resolves.toMatchObject({ toProgress: 0 });
    });

    it('passes the turn when a cast leaves the pending die nothing to move', async () => {
      await walk([40, -1, -1, -1]);
      await roll(host, 5);

      const launched = await cast<LudoLaunchedPayload>(
        host,
        LUDO_EVENTS.launch,
        LUDO_EVENTS.launched,
        0,
      );

      expect(launched.toProgress).toBe(55);
      expect(launched.turn).toMatchObject({
        stage: 'roll',
        movableTokens: [],
        nextTurnUserId: joiner.userId,
      });
    });
  });

  describe('winning', () => {
    beforeEach(async () => {
      await startMatch(joiner);
    });

    it('ends the match when a move banks the last pawn', async () => {
      await walk([56, 56, 56, 51]);

      const ended = waitFor<LudoEndedPayload>(
        joiner.socket,
        LUDO_EVENTS.ended,
      );
      const endings = collect<LudoEndedPayload>(
        joiner.socket,
        LUDO_EVENTS.ended,
      );
      await roll(host, 5);
      const moved = await move(host, 3);

      expect(moved).toMatchObject({
        toProgress: 56,
        winnerUserId: host.userId,
      });
      expect(await ended).toEqual({
        winnerUserId: host.userId,
        reason: 'complete',
      });

      expect(await completedRoom()).toMatchObject({
        winnerUserId: host.userId,
        endReason: 'complete',
      });
      const { body: history } =
        await host.get<MatchHistoryEntry[]>('/games/rooms/history');
      expect(history[0]).toMatchObject({
        roomId,
        result: 'win',
        endReason: 'complete',
        opponentUsername: joiner.label,
      });
      const { body: loserHistory } =
        await joiner.get<MatchHistoryEntry[]>('/games/rooms/history');
      expect(loserHistory[0]).toMatchObject({ roomId, result: 'loss' });

      expect(endings.drain()).toHaveLength(1);
      endings.stop();
    });

    it('ends the match once, and only once, when a launch banks the last pawn', async () => {
      await walk([56, 56, 56, 41]);

      const ended = waitFor<LudoEndedPayload>(
        joiner.socket,
        LUDO_EVENTS.ended,
      );
      const endings = collect<LudoEndedPayload>(
        joiner.socket,
        LUDO_EVENTS.ended,
      );
      const launched = await cast<LudoLaunchedPayload>(
        host,
        LUDO_EVENTS.launch,
        LUDO_EVENTS.launched,
        3,
      );

      expect(launched).toMatchObject({
        toProgress: 56,
        winnerUserId: host.userId,
      });
      expect(await ended).toEqual({
        winnerUserId: host.userId,
        reason: 'complete',
      });
      expect(await completedRoom()).toMatchObject({
        winnerUserId: host.userId,
        endReason: 'complete',
      });

      await new Promise(resolve => setTimeout(resolve, 300));
      expect(endings.drain()).toHaveLength(1);
      endings.stop();
    });
  });

  describe('forfeits', () => {
    it('eliminates the leaver and settles on the last seat standing', async () => {
      const third = await actor('third');
      await startMatch(joiner, third);

      const firstOut = waitFor<LudoEliminatedPayload>(
        host.socket,
        LUDO_EVENTS.eliminated,
      );
      const stillPlaying = expectNoEvent(host.socket, LUDO_EVENTS.ended);
      third.socket.emit(LUDO_EVENTS.forfeit, { roomId });

      expect(await firstOut).toMatchObject({
        userId: third.userId,
        color: 'yellow',
        winnerUserId: null,
      });
      expect((await firstOut).tokens.yellow).toEqual([-1, -1, -1, -1]);
      await stillPlaying;

      const ended = waitFor<LudoEndedPayload>(host.socket, LUDO_EVENTS.ended);
      joiner.socket.emit(LUDO_EVENTS.forfeit, { roomId });

      expect(await ended).toEqual({
        winnerUserId: host.userId,
        reason: 'forfeit',
      });
      expect(await completedRoom()).toMatchObject({
        winnerUserId: host.userId,
        endReason: 'forfeit',
      });
    });
  });
});
