export interface CacheStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds?: number): Promise<void>;
  del(...keys: string[]): Promise<void>;

  ping(): Promise<void>;

  tryLock(key: string, ttlMs: number): Promise<string | null>;
  // Releases only if the token still matches.
  unlock(key: string, token: string): Promise<void>;

  addDeadline(member: string, at: number): Promise<void>;
  removeDeadline(member: string): Promise<void>;
  // Atomic, so exactly one caller across instances receives a given member.
  popDueDeadlines(now: number, limit: number): Promise<string[]>;
}

export type CacheDriver = 'redis' | 'memory';

export const CacheKeys = {
  battleshipMatch: (roomId: string): string => `bs:match:${roomId}`,
  battleshipChat: (roomId: string): string => `bs:chat:${roomId}`,
  battleshipLock: (roomId: string): string => `lock:bs:${roomId}`,
  ludoMatch: (roomId: string): string => `ludo:match:${roomId}`,
  ludoLock: (roomId: string): string => `lock:ludo:${roomId}`,
  rpsMatch: (roomId: string): string => `rps:match:${roomId}`,
  rpsLock: (roomId: string): string => `lock:rps:${roomId}`,
  chromaMatch: (roomId: string): string => `chroma:match:${roomId}`,
  chromaLock: (roomId: string): string => `lock:chroma:${roomId}`,
  salvoMatch: (roomId: string): string => `salvo:match:${roomId}`,
  salvoLock: (roomId: string): string => `lock:salvo:${roomId}`,
  gameRoom: (id: string): string => `room:${id}`,
  lobbyCreatorSeen: (roomId: string): string => `room:seen:${roomId}`,
  platformStatus: (): string => 'platform:status',
  // Deleting it is what makes the nonce single-use.
  siweNonce: (nonce: string): string => `siwe:nonce:${nonce}`,
} as const;

// One ZSET for every game's deadlines; the member's kind routes enforcement.
export const DEADLINES_KEY = 'bs:deadlines';

export type DeadlineKind =
  | 'setup'
  | 'turn'
  | 'ludo-turn'
  | 'rps-round'
  | 'chroma-turn'
  | 'salvo-turn'
  | 'room-abandon';

const DEADLINE_KINDS: readonly DeadlineKind[] = [
  'setup',
  'turn',
  'ludo-turn',
  'rps-round',
  'chroma-turn',
  'salvo-turn',
  'room-abandon',
];

// `{roomId}|{kind}|{turnSeq}`
export const deadlineMember = (
  roomId: string,
  kind: DeadlineKind,
  seq: number,
): string => `${roomId}|${kind}|${seq}`;

// The third field is the user id, not a seq, so a re-disconnect upserts rather than piles up.
export const roomAbandonMember = (roomId: string, userId: string): string =>
  `${roomId}|room-abandon|${userId}`;

export const parseDeadlineMember = (
  member: string,
): { roomId: string; kind: DeadlineKind; seq: number; arg: string } | null => {
  const [roomId, kind, arg] = member.split('|');
  if (
    !roomId ||
    !DEADLINE_KINDS.includes(kind as DeadlineKind) ||
    arg === undefined
  ) {
    return null;
  }
  return { roomId, kind: kind as DeadlineKind, seq: Number(arg), arg };
};

// TTL is the only cleanup for match state.
export const MATCH_TTL_SECONDS = 24 * 60 * 60;
export const CHAT_TTL_SECONDS = 24 * 60 * 60;
// Bounds staleness if an invalidation is missed.
export const GAME_ROOM_TTL_SECONDS = 60;
export const PLATFORM_STATUS_TTL_SECONDS = 30;
export const MATCH_LOCK_TTL_MS = 5_000;
