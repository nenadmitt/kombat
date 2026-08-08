export const ADMIN_TOKEN_STORAGE_KEY = "kombat_admin_token";

/** Marks the 404 that means "bad token" apart from one that means "no such
 *  row", which the admin routes also answer with 404. */
export const ADMIN_DENIED_HEADER = "x-admin-denied";

/**
 * Lets an operator hand themselves the token via `/admin?token=…` instead of
 * reaching for devtools. Stripped from the URL immediately so it does not sit
 * in the address bar, though it still lands in browser history - treat a
 * pasted link as burned and rotate ADMIN_TOKEN if that matters.
 */
export function readAdminTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");
  if (!token) return null;

  url.searchParams.delete("token");
  window.history.replaceState(null, "", url.toString());
  return token;
}
