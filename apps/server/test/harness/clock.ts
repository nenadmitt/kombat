import {
  CacheKeys,
  deadlineMember,
  roomAbandonMember,
  type DeadlineKind,
} from '../../src/cache';
import type { TestApp } from './app';

// addDeadline upserts by member, so this reschedules rather than duplicates.
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

// Safe before the disconnect is processed: the scheduler upserts, so callers just retry.
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

// The sweeper drops a member whose seq no longer matches, so the seq has to be read, not guessed.
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
