/**
 * Client-recognized error codes. Backend error responses may include a
 * `code` field (e.g. `{ "code": "0102", "message": "..." }`) — as those get
 * defined server-side, add them here. Until then, every backend error
 * response falls back to `Unknown`.
 */
export enum ErrorCode {
  /** Backend responded with an error but no `code` field (or a client-side error with no server response at all, e.g. missing auth token). */
  Unknown = '0000',
  /** Request never reached the server — unreachable, offline, or timed out. */
  NetworkFailed = '0001',
  /** Multiplayer is paused by the operators; wallet and demos stay available. */
  Maintenance = '0002',
}
