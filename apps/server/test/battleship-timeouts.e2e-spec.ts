import {
  BATTLESHIP_EVENTS,
  GameRoomStatus,
  GameType,
  MAX_TIMEOUTS,
} from '@gaming-platform/core';

import { GameRoomEntity } from '../src/db/entities/game-room.entity';
import { startTestApp, type TestApp } from './harness/app';
import { createActor, type Actor } from './harness/actor';
import { subscribe, waitFor, waitUntil } from './harness/events';
import { expireCurrentTurn, expireDeadline, readMatch } from './harness/clock';
import { FAR_MINES, FIXED_FLEET } from './harness/fixtures/battleship';

describe('battleship timeouts (e2e)', () => {
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

  const enterSetup = async (): Promise<void> => {
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
  };

  const ready = (who: Actor): void => {
    who.socket.emit(BATTLESHIP_EVENTS.ready, {
      roomId,
      placements: FIXED_FLEET,
      mines: FAR_MINES,
    });
  };

  const startPlay = async (): Promise<void> => {
    await enterSetup();
    const started = waitFor(host.socket, BATTLESHIP_EVENTS.start);
    ready(host);
    ready(joiner);
    await started;
  };

  // A cell may only be fired once, so each miss needs its own column.
  const missCell = (n: number) => ({ row: 7, col: n });

  // Races the error channel so a refused shot reports why instead of timing out.
  const miss = async (who: Actor, cell: { row: number; col: number }) => {
    const shot = waitFor(who.socket, BATTLESHIP_EVENTS.shot);
    const refused = waitFor<{ message: string }>(
      who.socket,
      BATTLESHIP_EVENTS.error,
    ).then(({ message }) => {
      throw new Error(`Shot refused: ${message}`);
    });
    who.socket.emit(BATTLESHIP_EVENTS.fire, {
      roomId,
      kind: 'single',
      ...cell,
    });
    await Promise.race([shot, refused]);
  };

  const completedRoom = (): Promise<GameRoomEntity> =>
    waitUntil(async () => {
      const found = await testApp.dataSource
        .getRepository(GameRoomEntity)
        .findOneBy({ id: roomId });
      return found?.status === GameRoomStatus.Completed ? found : null;
    }, 10_000);

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

  describe('setup window', () => {
    it('hands the match to the only player who deployed', async () => {
      await enterSetup();
      ready(host);
      await waitFor(joiner.socket, BATTLESHIP_EVENTS.opponentReady);

      const ended = waitFor<{ winnerUserId: string; reason: string }>(
        host.socket,
        BATTLESHIP_EVENTS.ended,
        10_000,
      );
      await expireDeadline(testApp, roomId, 'setup', 0);

      expect(await ended).toMatchObject({
        winnerUserId: host.userId,
        reason: 'setup-timeout',
      });
      expect(await completedRoom()).toMatchObject({
        winnerUserId: host.userId,
        endReason: 'setup-timeout',
      });
    });

    it('voids the match when neither player deploys', async () => {
      await enterSetup();

      const ended = waitFor<{ winnerUserId: string | null; reason: string }>(
        host.socket,
        BATTLESHIP_EVENTS.ended,
        10_000,
      );
      await expireDeadline(testApp, roomId, 'setup', 0);

      expect(await ended).toMatchObject({
        winnerUserId: null,
        reason: 'setup-timeout',
      });
      expect(await completedRoom()).toMatchObject({
        winnerUserId: null,
        endReason: 'setup-timeout',
      });
    });

    it('ignores a setup deadline that fires after both players deployed', async () => {
      await startPlay();

      await expireDeadline(testApp, roomId, 'setup', 0);
      await new Promise(resolve => setTimeout(resolve, 1_500));

      const match = await readMatch(testApp, roomId);
      expect(match).toMatchObject({ phase: 'play', winnerUserId: null });
    });
  });

  describe('turn clock', () => {
    it('passes the turn on a single timeout', async () => {
      await startPlay();

      const timedOut = waitFor<{
        timedOutUserId: string;
        nextTurnUserId: string;
        timeouts: Record<string, number>;
      }>(joiner.socket, BATTLESHIP_EVENTS.turnTimeout, 10_000);
      await expireCurrentTurn(testApp, roomId);

      expect(await timedOut).toMatchObject({
        timedOutUserId: host.userId,
        nextTurnUserId: joiner.userId,
        timeouts: { [host.userId]: 1 },
      });
    });

    it('drops a deadline for a turn that already moved on', async () => {
      await startPlay();
      const before = await readMatch(testApp, roomId);

      await miss(host, missCell(0));
      await expireDeadline(testApp, roomId, 'turn', before!.turnSeq);
      await new Promise(resolve => setTimeout(resolve, 1_500));

      const match = await readMatch(testApp, roomId);
      expect(match).toMatchObject({ phase: 'play' });
      expect(match!.timeouts[host.userId]).toBe(0);
      expect(match!.timeouts[joiner.userId]).toBe(0);
    });

    it('settles the match when one player stops playing', async () => {
      await startPlay();

      for (let i = 0; i < MAX_TIMEOUTS; i++) {
        await miss(host, missCell(i));
        await waitUntil(async () => {
          const match = await readMatch(testApp, roomId);
          return match?.turnUserId === joiner.userId ? match : null;
        });
        await expireCurrentTurn(testApp, roomId);
        await waitUntil(async () => {
          const match = await readMatch(testApp, roomId);
          return (match?.timeouts[joiner.userId] ?? 0) === i + 1 ? match : null;
        }, 10_000);
      }

      const match = await readMatch(testApp, roomId);
      expect(match).toMatchObject({
        phase: 'over',
        winnerUserId: host.userId,
        endReason: 'timeout',
      });
      expect(await completedRoom()).toMatchObject({
        winnerUserId: host.userId,
        endReason: 'timeout',
      });
    });
  });

  describe('abandonment', () => {
    it('resolves a match both players walked away from', async () => {
      await startPlay();
      host.disconnect();
      joiner.disconnect();

      // Turns alternate on each timeout, so the host (who opened) caps out first.
      for (let i = 0; i < MAX_TIMEOUTS * 2; i++) {
        const match = await readMatch(testApp, roomId);
        if (match?.phase === 'over') {
          break;
        }
        await expireCurrentTurn(testApp, roomId);
        // The capping timeout doesn't restart the clock, so turnSeq stops moving; phase is the other exit.
        await waitUntil(async () => {
          const next = await readMatch(testApp, roomId);
          if (!next) {
            return null;
          }
          return next.turnSeq !== match!.turnSeq || next.phase === 'over'
            ? next
            : null;
        }, 10_000);
      }

      const match = await readMatch(testApp, roomId);
      expect(match).toMatchObject({
        phase: 'over',
        winnerUserId: joiner.userId,
        endReason: 'timeout',
      });
      expect(match!.timeouts[host.userId]).toBe(MAX_TIMEOUTS);
      expect(await completedRoom()).toMatchObject({
        status: GameRoomStatus.Completed,
        winnerUserId: joiner.userId,
        endReason: 'timeout',
      });
    });
  });
});
