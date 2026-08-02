/**
 * A username is the display identity; the ENS label is derived from it. The
 * two charsets do not agree - usernames allow underscores and uppercase, ENS
 * normalisation (ENSIP-15) allows neither mid-label - so the label is always
 * derived, never assumed equal to the username.
 *
 * Server and client share this so they cannot disagree about the name a
 * username maps to.
 */

export const ENS_LABEL_MAX_LENGTH = 63;

/**
 * Lowercase, underscores to hyphens, drop everything else, and collapse the
 * hyphen runs that leaves behind. Returns null when nothing usable survives.
 */
export function toEnsLabel(username: string): string | null {
  const label = username
    .toLowerCase()
    .replace(/_/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ENS_LABEL_MAX_LENGTH)
    // The slice can re-expose a trailing hyphen.
    .replace(/-+$/g, '');
  return label.length > 0 ? label : null;
}

/**
 * Nth candidate for a label whose earlier attempts were taken: the label
 * itself, then -2, -3, and so on. Attempt is 1-based.
 */
export function ensLabelCandidate(label: string, attempt: number): string {
  if (attempt <= 1) {
    return label;
  }
  const suffix = `-${attempt}`;
  const trimmed = label
    .slice(0, ENS_LABEL_MAX_LENGTH - suffix.length)
    .replace(/-+$/g, '');
  return `${trimmed}${suffix}`;
}

export function ensFullName(label: string, parentName: string): string {
  return `${label}.${parentName}`;
}
