/**
 * Fallback display code derived from a room's UUID. Rooms now carry a real,
 * server-generated `code` used for join-by-code; this only covers legacy rooms
 * created before that existed (where `code` is null).
 */
export function formatRoomCode(id: string): string {
  return id.replace(/-/g, '').slice(-6).toUpperCase();
}
