import {
  CacheKeys,
  deadlineMember,
  roomAbandonMember,
  type DeadlineKind,
} from '../../src/cache';
import type { TestApp } from './app';

/**
 * Deadlines are data in a sorted set, so a test rewrites the scheduled time
 * into the past and the real GameDeadlineSweeper enforces it on its next
 * 1s tick. That beats shortening TURN_SECONDS/SETUP_SECONDS: nothing is
 * stubbed, the production sweep path is what runs, and a case costs about a
 * second instead of the full 30 or 90.
 *
 * `addDeadline` upserts by member, so this reschedules rather than duplicates.
 */
export async function expireDeadline(
  testApp: TestApp,
  roomId: string,
  kind: DeadlineKind,
  seq: number,
): Promise<void> {
  await testApp.cache.addDeadline(
    deadlineMember(roomId, kind, seq),
    Date.now() - 1,
  );
}

/** The abandon grace window, same trick. Safe to call before the disconnect
 *  has been processed: the scheduler upserts, so callers just try again. */
export async function expireAbandon(
  testApp: TestApp,
  roomId: string,
  userId: string,
): Promise<void> {
  await testApp.cache.addDeadline(roomAbandonMember(roomId, userId), Date.now() - 1);
}

type CachedMatch = {
  phase: 'setup' | 'play' | 'over';
  turnUserId: string | null;
  turnSeq: number;
  winnerUserId: string | null;
  endReason: string | null;
  timeouts: Record<string, number>;
};

/** Each game keys its match state and its turn deadlines differently. */
type Game = 'battleship' | 'ludo';

const MATCH_KEY: Record<Game, (roomId: string) => string> = {
  battleship: CacheKeys.battleshipMatch,
  ludo: CacheKeys.ludoMatch,
};

const TURN_KIND: Record<Game, DeadlineKind> = {
  battleship: 'turn',
  ludo: 'ludo-turn',
};

export function readMatch(
  testApp: TestApp,
  roomId: string,
  game: Game = 'battleship',
): Promise<CachedMatch | null> {
  return testApp.cache.getJson<CachedMatch>(MATCH_KEY[game](roomId));
}

/** Expire whichever turn the match is actually sitting on. The sweeper drops a
 *  member whose seq no longer matches, so the seq has to be read, not guessed. */
export async function expireCurrentTurn(
  testApp: TestApp,
  roomId: string,
  game: Game = 'battleship',
): Promise<void> {
  const match = await readMatch(testApp, roomId, game);
  if (!match) {
    throw new Error(`No cached match for room ${roomId}`);
  }
  await expireDeadline(testApp, roomId, TURN_KIND[game], match.turnSeq);
}
