/**
 * Server-side reads of the NestJS platform API's operator surface. The token
 * is a different secret from this app's own ADMIN_TOKEN and never leaves the
 * server, so the browser talks to our route handlers instead of that API.
 */
const API_URL =
  process.env.PLATFORM_API_URL ??
  process.env.NEXT_PUBLIC_PLATFORM_API_URL ??
  "https://api.playkombat.xyz/api/v1";

export type PlatformAdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

export async function platformAdminGet<T>(
  path: string,
): Promise<PlatformAdminResult<T>> {
  const token = process.env.PLATFORM_ADMIN_TOKEN;
  if (!token) {
    return {
      ok: false,
      status: 503,
      error: "PLATFORM_ADMIN_TOKEN is not configured.",
    };
  }

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      headers: { "x-admin-token": token },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 502,
      error: "Could not reach the platform API.",
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      status: response.status === 404 ? 404 : 502,
      error:
        response.status === 401
          ? "The platform API rejected PLATFORM_ADMIN_TOKEN."
          : `The platform API returned ${response.status}.`,
    };
  }

  return { ok: true, data: (await response.json()) as T };
}
