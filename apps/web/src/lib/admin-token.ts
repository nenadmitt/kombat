export const ADMIN_TOKEN_STORAGE_KEY = "kombat_admin_token";

// Tells a bad-token 404 apart from a missing-row 404.
export const ADMIN_DENIED_HEADER = "x-admin-denied";

// Stripped from the URL at once, but it still lands in browser history: rotate ADMIN_TOKEN after sharing a link.
export function readAdminTokenFromUrl(): string | null {
  const url = new URL(window.location.href);
  const token = url.searchParams.get("token");
  if (!token) return null;

  url.searchParams.delete("token");
  window.history.replaceState(null, "", url.toString());
  return token;
}
