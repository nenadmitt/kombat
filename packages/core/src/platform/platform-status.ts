export type PlatformStatus = {
  maintenance: boolean;
  message: string | null;
  /** Semver floor; null or absent means none. */
  minAppVersion?: string | null;
  latestAppVersion?: string | null;
  updateMessage?: string | null;
  updateNotes?: string[];
  updateSizeLabel?: string | null;
  updateUrls?: { ios?: string | null; android?: string | null };
};

/** Missing parts count as 0. */
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

/** Unparseable input fails open. */
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

export const PLATFORM_EVENTS = {
  maintenance: 'platform:maintenance',
} as const;
