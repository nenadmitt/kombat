/**
 * Platform-wide status shared by the public GET /status endpoint and the
 * maintenance socket broadcast, so both sides of the wire agree on one shape.
 */
export type PlatformStatus = {
  /** True while multiplayer is paused; wallet/history/demos stay available. */
  maintenance: boolean;
  /** Optional operator-provided copy for the client banner. */
  message: string | null;
  /** Semver floor: clients below it must update. Null/absent = no floor. */
  minAppVersion?: string | null;
  /** The version the update installs - the arrow target on the screen. */
  latestAppVersion?: string | null;
  /** Optional copy for the update screen, replacing the default line. */
  updateMessage?: string | null;
  /** Optional release-note lines for the update screen. */
  updateNotes?: string[];
  /** Optional human download-size label, e.g. "18.4 MB". */
  updateSizeLabel?: string | null;
  /** Per-platform install links for the Update button. */
  updateUrls?: { ios?: string | null; android?: string | null };
};

/** Numeric x.y.z comparator (missing parts count as 0): negative when a < b. */
export function compareAppVersions(a: string, b: string): number {
  const parse = (v: string) => v.trim().split('.').map(n => parseInt(n, 10));
  const pa = parse(a);
  const pb = parse(b);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) {
      return d;
    }
  }
  return 0;
}

/** Whether `version` falls below a floor. Unparseable input fails open. */
export function isVersionBelow(
  version: string | null | undefined,
  min: string | null | undefined,
): boolean {
  if (!min || !version) {
    return false;
  }
  if (!/^\d+(\.\d+){0,2}$/.test(version.trim()) || !/^\d+(\.\d+){0,2}$/.test(min.trim())) {
    return false;
  }
  return compareAppVersions(version, min) < 0;
}

/** Socket events sent to every connected client, outside any match channel. */
export const PLATFORM_EVENTS = {
  /** Maintenance mode was toggled; payload is a {@link PlatformStatus}. */
  maintenance: 'platform:maintenance',
} as const;
