/** Fallback display code for legacy rooms created before server-generated codes (`code` is null). */
export function formatRoomCode(id: string): string {
  return id.replace(/-/g, '').slice(-6).toUpperCase();
}
