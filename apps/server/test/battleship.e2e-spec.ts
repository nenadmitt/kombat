import {
  BATTLESHIP_EVENTS,
  FLEET,
  GameRoomStatus,
  GameType,
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
  waitUntil,
} from './harness/events';
import {
  EMPTY_CELL,
  EMPTY_CELL_2,
  FAR_MINES,
  FIXED_FLEET,
  SHIP_CELLS,
} from './harness/fixtures/battleship';

type ShotPayload = {
  byUserId: string;
  cells: { row: number; col: number; result: string }[];
  sunkShips: { id: string }[];
  nextTurnUserId: string;
  winnerUserId: string | null;
};

describe('battleship match (e2e)', () => {
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

  /** Room created, filled, both fleets down, host on turn. */
  const startMatch = async (): Promise<void> => {
    const { body: room } = await host.post('/games/rooms', {
      gameType: GameType.NavalBattle,
    });
    roomId = room.id;
    await joiner.post(`/games/rooms/${roomId}/join`);

    const channel = `game:${roomId}`;
    await subscribe(host.socket, channel);
    await subscribe(joiner.socket, channel);

    host.socket.emit(BATTLESHIP_EVENTS.enter, { roomId });
    joiner.socket.emit(BATTLESHIP_EVENTS.enter, { roomId });
    await waitFor(host.socket, BATTLESHIP_EVENTS.setupState);

    const started = waitFor<{ firstTurnUserId: string }>(
      host.socket,
      BATTLESHIP_EVENTS.start,
    );
    host.socket.emit(BATTLESHIP_EVENTS.ready, {
      roomId,
      placements: FIXED_FLEET,
      mines: FAR_MINES,
    });
    joiner.socket.emit(BATTLESHIP_EVENTS.ready, {
      roomId,
      placements: FIXED_FLEET,
      mines: FAR_MINES,
    });

    // The creator is players[0], so the host always opens.
    expect(await started).toMatchObject({ firstTurnUserId: host.userId });
  };

  const fire = async (cell: { row: number; col: number }) => {
    const shot = waitFor<ShotPayload>(host.socket, BATTLESHIP_EVENTS.shot);
    host.socket.emit(BATTLESHIP_EVENTS.fire, {
      roomId,
      kind: 'single',
      ...cell,
    });
    return shot;
  };

  beforeAll(async () => {
    testApp = await startTestApp();
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    actors = [];
    await testApp.truncate();
    host = await actor('host');
    joiner = await actor('joiner');
  });

  afterEach(() => {
    actors.forEach(a => a.disconnect());
  });

  describe('outsiders', () => {
    beforeEach(async () => {
      await startMatch();
    });

    it('cannot join a match that is already full', async () => {
      const outsider = await actor('outsider');

      const { status, body } = await outsider.post(
        `/games/rooms/${roomId}/join`,
      );

      expect(status).toBe(409);
      expect(body.message).toContain('no longer accepting players');
    });

    it('cannot read the match state', async () => {
      const outsider = await actor('outsider');

      const { status, body } = await outsider.get(
        `/games/rooms/${roomId}/state`,
      );

      expect(status).toBe(403);
      expect(body.message).toContain('not part of this room');
    });

    it('cannot listen in on match broadcasts', async () => {
      const outsider = await actor('outsider');
      await subscribe(outsider.socket, `game:${roomId}`);

      const heard = waitFor(joiner.socket, BATTLESHIP_EVENTS.shot);
      const silence = expectNoEvent(
        outsider.socket,
        BATTLESHIP_EVENTS.shot,
        1_000,
      );
      await fire(SHIP_CELLS[0]!);

      await expect(heard).resolves.toBeDefined();
      await silence;
    });

    it('cannot fire into the match', async () => {
      const outsider = await actor('outsider');

      const error = waitFor<{ message: string }>(
        outsider.socket,
        BATTLESHIP_EVENTS.error,
      );
      outsider.socket.emit(BATTLESHIP_EVENTS.fire, {
        roomId,
        kind: 'single',
        row: 0,
        col: 0,
      });

      expect(await error).toMatchObject({
        message: expect.stringContaining('not part of this room'),
      });
    });
  });

  describe('playing', () => {
    beforeEach(async () => {
      await startMatch();
    });

    it('keeps the turn on a hit and passes it on a miss', async () => {
      const hit = await fire(SHIP_CELLS[0]!);
      expect(hit.cells[0]!.result).toBe('hit');
      expect(hit.nextTurnUserId).toBe(host.userId);

      const miss = await fire(EMPTY_CELL);
      expect(miss.cells[0]!.result).toBe('miss');
      expect(miss.nextTurnUserId).toBe(joiner.userId);
    });

    it('applies only one of two moves fired at once', async () => {
      const shots = collect<ShotPayload>(host.socket, BATTLESHIP_EVENTS.shot);
      const refused = waitFor<{ message: string }>(
        host.socket,
        BATTLESHIP_EVENTS.error,
      );

      // Both misses, emitted in the same tick. The room lock serializes them,
      // and the first one passes the turn - so the second has to be refused
      // rather than applied.
      host.socket.emit(BATTLESHIP_EVENTS.fire, {
        roomId,
        kind: 'single',
        ...EMPTY_CELL,
      });
      host.socket.emit(BATTLESHIP_EVENTS.fire, {
        roomId,
        kind: 'single',
        ...EMPTY_CELL_2,
      });

      expect(await refused).toMatchObject({
        message: expect.stringContaining('not your turn'),
      });
      await new Promise(resolve => setTimeout(resolve, 300));
      expect(shots.drain()).toHaveLength(1);
      shots.stop();
    });

    it('rejects a repeat shot at a cell already fired on', async () => {
      await fire(SHIP_CELLS[0]!);

      const refused = waitFor<{ message: string }>(
        host.socket,
        BATTLESHIP_EVENTS.error,
      );
      host.socket.emit(BATTLESHIP_EVENTS.fire, {
        roomId,
        kind: 'single',
        ...SHIP_CELLS[0]!,
      });

      expect(await refused).toMatchObject({
        message: expect.stringContaining('already fired there'),
      });
    });

    it('rejects a shot fired out of turn', async () => {
      const error = waitFor<{ message: string }>(
        joiner.socket,
        BATTLESHIP_EVENTS.error,
      );
      joiner.socket.emit(BATTLESHIP_EVENTS.fire, {
        roomId,
        kind: 'single',
        ...EMPTY_CELL,
      });

      expect(await error).toMatchObject({
        message: expect.stringContaining('not your turn'),
      });
    });

    it('sinks the whole fleet in one unbroken turn and wins', async () => {
      const sunk: string[] = [];
      let final!: ShotPayload;
      for (const [index, cell] of SHIP_CELLS.entries()) {
        const shot = await fire(cell);
        expect(shot.cells[0]!.result).toBe('hit');
        sunk.push(...shot.sunkShips.map(s => s.id));

        const isLast = index === SHIP_CELLS.length - 1;
        if (!isLast) {
          // Every shot lands, so the turn never leaves the host.
          expect(shot.nextTurnUserId).toBe(host.userId);
          expect(shot.winnerUserId).toBeNull();
        }
        final = shot;
      }

      expect(SHIP_CELLS).toHaveLength(17);
      expect(sunk).toHaveLength(FLEET.length);
      // A win by play is carried on the shot itself; `ended` is reserved for
      // forfeits and timeouts, which have no shot to attach it to.
      expect(final.winnerUserId).toBe(host.userId);
      expect(final.nextTurnUserId).toBe(host.userId);
    });

    it('records the completed room and the result for both players', async () => {
      for (const cell of SHIP_CELLS) {
        await fire(cell);
      }

      const rooms = testApp.dataSource.getRepository(GameRoomEntity);
      const room = await waitUntil(async () => {
        const found = await rooms.findOneBy({ id: roomId });
        return found?.status === GameRoomStatus.Completed ? found : null;
      });
      expect(room).toMatchObject({
        winnerUserId: host.userId,
        endReason: 'complete',
      });
      expect(room.completedAt).toBeInstanceOf(Date);

      const { body: hostHistory } =
        await host.get<MatchHistoryEntry[]>('/games/rooms/history');
      expect(hostHistory).toHaveLength(1);
      expect(hostHistory[0]).toMatchObject({
        roomId,
        result: 'win',
        endReason: 'complete',
        opponentUsername: joiner.label,
        stakeAmount: null,
      });

      const { body: joinerHistory } =
        await joiner.get<MatchHistoryEntry[]>('/games/rooms/history');
      expect(joinerHistory[0]).toMatchObject({ roomId, result: 'loss' });
    });

    it('refuses further fire once the match is over', async () => {
      for (const cell of SHIP_CELLS) {
        await fire(cell);
      }

      const error = waitFor<{ message: string }>(
        host.socket,
        BATTLESHIP_EVENTS.error,
      );
      host.socket.emit(BATTLESHIP_EVENTS.fire, {
        roomId,
        kind: 'single',
        ...EMPTY_CELL,
      });

      expect(await error).toMatchObject({
        message: expect.stringContaining('not in play'),
      });
    });
  });
});
