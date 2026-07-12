/**
 * Short display-only code derived from a room's UUID. Not a real invite/join
 * code - there's no backend room-code field or join-by-code endpoint yet,
 * this just gives the "waiting" UI something room-specific to show.
 */
export function formatRoomCode(id: string): string {
  return id.replace(/-/g, '').slice(-6).toUpperCase();
}
