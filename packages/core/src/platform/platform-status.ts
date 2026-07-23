/**
 * Platform-wide status shared by the public GET /status endpoint and the
 * maintenance socket broadcast, so both sides of the wire agree on one shape.
 */
export type PlatformStatus = {
  /** True while multiplayer is paused; wallet/history/demos stay available. */
  maintenance: boolean;
  /** Optional operator-provided copy for the client banner. */
  message: string | null;
};

/** Socket events sent to every connected client, outside any match channel. */
export const PLATFORM_EVENTS = {
  /** Maintenance mode was toggled; payload is a {@link PlatformStatus}. */
  maintenance: 'platform:maintenance',
} as const;
