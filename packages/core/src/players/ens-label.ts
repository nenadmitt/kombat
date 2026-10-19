// ENSIP-15 normalisation rejects underscores and uppercase, so the label is always derived from the username.

export const ENS_LABEL_MAX_LENGTH = 63;

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
