/**
 * Minimal shared-store contract the app needs for stateless gameplay:
 * plain KV with TTL, a per-room mutex, and a deadline schedule (sorted set)
 * for server-authoritative timeout enforcement.
 *
 * Implemented by RedisCacheStore (multi-instance) and InMemoryCacheStore
 * (single instance — today's behavior when REDIS_URL is unset).
 */
export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;

  /** SET NX PX — returns a lock token, or null if already held. */
  tryLock(key: string, ttlMs: number): Promise<string | null>;
  /** Releases only if the token still matches (compare-and-del). */
  unlock(key: string, token: string): Promise<void>;

  /** Schedule `member` at epoch-ms `at` (upserts the score). */
  addDeadline(member: string, at: number): Promise<void>;
  removeDeadline(member: string): Promise<void>;
  /**
   * Atomically pop members due at/before `now`, oldest first. Atomicity is
   * what makes multi-instance sweeping safe: exactly one caller receives a
   * given member.
   */
  popDueDeadlines(now: number, limit: number): Promise<string[]>;
}

export type CacheDriver = 'redis' | 'memory';

// --- key schema --------------------------------------------------------------

export const CacheKeys = {
  /** Authoritative Battleship MatchState JSON. */
  battleshipMatch: (roomId: string): string => `bs:match:${roomId}`,
  /** Placeholder chat log (string[] JSON) for a game room. */
  battleshipChat: (roomId: string): string => `bs:chat:${roomId}`,
  /** Per-room mutex guarding read-mutate-write cycles on the match. */
  battleshipLock: (roomId: string): string => `lock:bs:${roomId}`,
  /** Authoritative Ludo MatchState JSON. */
  ludoMatch: (roomId: string): string => `ludo:match:${roomId}`,
  /** Per-room mutex guarding read-mutate-write cycles on the Ludo match. */
  ludoLock: (roomId: string): string => `lock:ludo:${roomId}`,
  /** Authoritative Triple Cut (RPS) MatchState JSON. */
  rpsMatch: (roomId: string): string => `rps:match:${roomId}`,
  /** Per-room mutex guarding read-mutate-write cycles on the RPS match. */
  rpsLock: (roomId: string): string => `lock:rps:${roomId}`,
  /** Cached GameRoomEntity JSON (short TTL — bounds staleness). */
  gameRoom: (id: string): string => `room:${id}`,
} as const;

/** Single ZSET holding every scheduled game deadline (all games share it so
 *  one sweeper drains everything; the member's kind routes enforcement). */
export const DEADLINES_KEY = 'bs:deadlines';

/** Deadline kinds: `setup`/`turn` are Battleship's, `ludo-turn` is Ludo's,
 *  `rps-round` is Triple Cut's. A new turn-based game adds its own kind here
 *  and an enforcer in the deadline sweeper. */
export type DeadlineKind = 'setup' | 'turn' | 'ludo-turn' | 'rps-round';

const DEADLINE_KINDS: readonly DeadlineKind[] = [
  'setup',
  'turn',
  'ludo-turn',
  'rps-round',
];

/** Member format for DEADLINES_KEY: `{roomId}|{kind}|{turnSeq}`. */
export const deadlineMember = (
  roomId: string,
  kind: DeadlineKind,
  seq: number,
): string => `${roomId}|${kind}|${seq}`;

export const parseDeadlineMember = (
  member: string,
): { roomId: string; kind: DeadlineKind; seq: number } | null => {
  const [roomId, kind, seq] = member.split('|');
  if (
    !roomId ||
    !DEADLINE_KINDS.includes(kind as DeadlineKind) ||
    seq === undefined
  ) {
    return null;
  }
  return { roomId, kind: kind as DeadlineKind, seq: Number(seq) };
};

// --- TTLs ----------------------------------------------------------------------

/** Match + chat live for a day past the last write; TTL is the only cleanup. */
export const MATCH_TTL_SECONDS = 24 * 60 * 60;
export const CHAT_TTL_SECONDS = 24 * 60 * 60;
/** Room rows change rarely mid-match; 60s bounds staleness if an invalidation is missed. */
export const GAME_ROOM_TTL_SECONDS = 60;
/** Auto-expiry safety net for a lock whose holder died mid-critical-section. */
export const MATCH_LOCK_TTL_MS = 5_000;
