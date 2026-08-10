import {
  BATTLESHIP_EVENTS,
  LUDO_EVENTS,
  RPS_EVENTS,
  SALVO_EVENTS,
} from '@gaming-platform/core';

import { CacheService, deadlineMember, roomAbandonMember } from '../cache';
import { WebsocketsService } from '../websockets';
import { BattleshipMatchService } from './battleships/battleship-match.service';
import { ChromaMatchService } from './chroma/chroma-match.service';
import { GameDeadlineSweeper } from './game-deadline.sweeper';
import { LudoMatchService } from './ludo/ludo-match.service';
import { RoomAbandonService } from './room-abandon.service';
import { RpsMatchService } from './rps/rps-match.service';
import { SalvoMatchService } from './salvo/salvo-match.service';
import { StakesService } from './stakes/stakes.service';

const ROOM = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const WINNER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

/**
 * The sweeper is the only thing that ends an abandoned match, and an abandoned
 * staked match is locked money - so what matters here is that every expired
 * deadline reaches its enforcer, that stale members die silently, and that one
 * failing room cannot stop the rest of the batch from resolving.
 */
describe('GameDeadlineSweeper', () => {
  let due: string[];
  let popCalls: number;
  let popGate: (() => void) | null;
  let channelEvents: { channel: string; event: string }[];
  let completions: { roomId: string; winnerUserId: string | null; reason: string }[];

  let battleship: { timeoutTurn: jest.Mock; timeoutSetup: jest.Mock };
  let ludo: { timeoutTurn: jest.Mock };
  let rps: { timeoutRound: jest.Mock };
  let chroma: { timeoutTurn: jest.Mock };
  let salvo: { timeoutTurn: jest.Mock };
  let roomAbandon: { enforce: jest.Mock };
  let sweeper: GameDeadlineSweeper;

  const sweep = () =>
    (sweeper as unknown as { sweep(): Promise<void> }).sweep();

  beforeEach(() => {
    due = [];
    popCalls = 0;
    popGate = null;
    channelEvents = [];
    completions = [];

    const cache = {
      popDueDeadlines: async () => {
        popCalls += 1;
        if (popGate) {
          await new Promise<void>(resolve => {
            popGate = resolve as () => void;
          });
        }
        const batch = due;
        due = [];
        return batch;
      },
    } as unknown as CacheService;

    const websockets = {
      sendToChannel: (channel: string, event: string) => {
        channelEvents.push({ channel, event });
      },
      sendToUser: () => undefined,
    } as unknown as WebsocketsService;

    const stakes = {
      completeMatch: async (
        roomId: string,
        winnerUserId: string | null,
        reason: string,
      ) => {
        completions.push({ roomId, winnerUserId, reason });
      },
    } as unknown as StakesService;

    battleship = {
      timeoutTurn: jest.fn().mockResolvedValue(null),
      timeoutSetup: jest.fn().mockResolvedValue(null),
    };
    ludo = { timeoutTurn: jest.fn().mockResolvedValue(null) };
    rps = { timeoutRound: jest.fn().mockResolvedValue(null) };
    chroma = { timeoutTurn: jest.fn().mockResolvedValue(null) };
    salvo = { timeoutTurn: jest.fn().mockResolvedValue(null) };
    roomAbandon = { enforce: jest.fn().mockResolvedValue(undefined) };

    sweeper = new GameDeadlineSweeper(
      cache,
      battleship as unknown as BattleshipMatchService,
      chroma as unknown as ChromaMatchService,
      salvo as unknown as SalvoMatchService,
      ludo as unknown as LudoMatchService,
      rps as unknown as RpsMatchService,
      websockets,
      stakes,
      roomAbandon as unknown as RoomAbandonService,
    );
  });

  describe('routing', () => {
    it('routes every kind to its enforcer with the room and seq', async () => {
      due = [
        deadlineMember(ROOM, 'setup', 0),
        deadlineMember(ROOM, 'turn', 3),
        deadlineMember(ROOM, 'ludo-turn', 4),
        deadlineMember(ROOM, 'rps-round', 5),
        deadlineMember(ROOM, 'chroma-turn', 6),
        deadlineMember(ROOM, 'salvo-turn', 7),
      ];
      await sweep();

      expect(battleship.timeoutSetup).toHaveBeenCalledWith(ROOM);
      expect(battleship.timeoutTurn).toHaveBeenCalledWith(ROOM, 3);
      expect(ludo.timeoutTurn).toHaveBeenCalledWith(ROOM, 4);
      expect(rps.timeoutRound).toHaveBeenCalledWith(ROOM, 5);
      expect(chroma.timeoutTurn).toHaveBeenCalledWith(ROOM, 6);
      expect(salvo.timeoutTurn).toHaveBeenCalledWith(ROOM, 7);
    });

    it('routes an abandon member with the user id from its third field', async () => {
      due = [roomAbandonMember(ROOM, WINNER)];
      await sweep();

      expect(roomAbandon.enforce).toHaveBeenCalledWith(ROOM, WINNER);
    });

    it('drops malformed members without aborting the batch', async () => {
      due = ['garbage', `${ROOM}|not-a-kind|1`, deadlineMember(ROOM, 'turn', 1)];
      await sweep();

      expect(battleship.timeoutTurn).toHaveBeenCalledWith(ROOM, 1);
      expect(completions).toHaveLength(0);
    });
  });

  describe('stale deadlines', () => {
    it('does nothing when the match service reports the deadline stale', async () => {
      due = [
        deadlineMember(ROOM, 'turn', 1),
        deadlineMember(ROOM, 'ludo-turn', 1),
        deadlineMember(ROOM, 'rps-round', 1),
        deadlineMember(ROOM, 'chroma-turn', 1),
        deadlineMember(ROOM, 'salvo-turn', 1),
        deadlineMember(ROOM, 'setup', 0),
      ];
      await sweep();

      expect(channelEvents).toHaveLength(0);
      expect(completions).toHaveLength(0);
    });
  });

  describe('terminal timeouts settle the stakes', () => {
    it('battleship turn timeout with a winner completes the match', async () => {
      battleship.timeoutTurn.mockResolvedValue({ winnerUserId: WINNER });
      due = [deadlineMember(ROOM, 'turn', 2)];
      await sweep();

      expect(channelEvents).toEqual([
        expect.objectContaining({ event: BATTLESHIP_EVENTS.turnTimeout }),
      ]);
      expect(completions).toEqual([
        { roomId: ROOM, winnerUserId: WINNER, reason: 'timeout' },
      ]);
    });

    it('battleship turn timeout without a winner completes nothing', async () => {
      battleship.timeoutTurn.mockResolvedValue({ winnerUserId: null });
      due = [deadlineMember(ROOM, 'turn', 2)];
      await sweep();

      expect(completions).toHaveLength(0);
    });

    it('battleship setup timeout completes even with no winner - the void path', async () => {
      battleship.timeoutSetup.mockResolvedValue({ winnerUserId: null });
      due = [deadlineMember(ROOM, 'setup', 0)];
      await sweep();

      expect(channelEvents).toEqual([
        expect.objectContaining({ event: BATTLESHIP_EVENTS.ended }),
      ]);
      expect(completions).toEqual([
        { roomId: ROOM, winnerUserId: null, reason: 'setup-timeout' },
      ]);
    });

    it('ludo elimination timeout with a survivor ends and settles', async () => {
      ludo.timeoutTurn.mockResolvedValue({ winnerUserId: WINNER });
      due = [deadlineMember(ROOM, 'ludo-turn', 9)];
      await sweep();

      expect(channelEvents.map(e => e.event)).toEqual([
        LUDO_EVENTS.turnTimeout,
        LUDO_EVENTS.ended,
      ]);
      expect(completions).toEqual([
        { roomId: ROOM, winnerUserId: WINNER, reason: 'timeout' },
      ]);
    });

    it('rps and salvo cap-outs settle with reason timeout', async () => {
      rps.timeoutRound.mockResolvedValue({
        reveal: { winnerUserId: WINNER },
        over: true,
      });
      salvo.timeoutTurn.mockResolvedValue({ winnerUserId: WINNER });
      due = [
        deadlineMember(ROOM, 'rps-round', 1),
        deadlineMember(ROOM, 'salvo-turn', 1),
      ];
      await sweep();

      expect(channelEvents.map(e => e.event)).toEqual([
        RPS_EVENTS.reveal,
        RPS_EVENTS.ended,
        SALVO_EVENTS.turnTimeout,
        SALVO_EVENTS.ended,
      ]);
      expect(completions).toHaveLength(2);
    });

    it('a mutual rps cap-out voids: ended and settled with no winner', async () => {
      rps.timeoutRound.mockResolvedValue({
        reveal: { winnerUserId: null },
        over: true,
      });
      due = [deadlineMember(ROOM, 'rps-round', 1)];
      await sweep();

      expect(channelEvents.map(e => e.event)).toEqual([
        RPS_EVENTS.reveal,
        RPS_EVENTS.ended,
      ]);
      expect(completions).toEqual([
        { roomId: ROOM, winnerUserId: null, reason: 'timeout' },
      ]);
    });
  });

  describe('resilience', () => {
    it('one throwing enforcer does not stop later members from resolving', async () => {
      battleship.timeoutTurn.mockRejectedValue(new Error('room lock lost'));
      salvo.timeoutTurn.mockResolvedValue({ winnerUserId: WINNER });
      due = [
        deadlineMember(ROOM, 'turn', 1),
        deadlineMember(ROOM, 'salvo-turn', 1),
      ];
      await sweep();

      expect(completions).toEqual([
        { roomId: ROOM, winnerUserId: WINNER, reason: 'timeout' },
      ]);
    });

    it('a failing pop leaves the sweeper alive for the next tick', async () => {
      const cache = (sweeper as unknown as { cacheService: CacheService })
        .cacheService;
      (cache as unknown as { popDueDeadlines: () => Promise<string[]> }).popDueDeadlines =
        async () => {
          throw new Error('redis gone');
        };
      await expect(sweep()).resolves.toBeUndefined();
    });

    it('skips a tick while the previous sweep is still running', async () => {
      popGate = () => undefined;
      const first = sweep();
      await Promise.resolve();
      await sweep();
      expect(popCalls).toBe(1);

      (popGate as () => void)();
      await first;
    });
  });
});
