// The platform operator token is a separate secret that never leaves the server.
const API_URL =
  process.env.PLATFORM_API_URL ??
  process.env.NEXT_PUBLIC_PLATFORM_API_URL ??
  "https://api.playkombat.xyz/api/v1";

/** Below the platform edge's own gateway timeout, so we answer, not it. */
const TIMEOUT_MS = 15_000;

export type PlatformAdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; error: string };

function reason(error: unknown): string {
  const cause = (error as { cause?: { code?: string } })?.cause?.code;
  if (cause) return cause;
  return error instanceof Error ? error.message : String(error);
}

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
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return {
        ok: false,
        status: 504,
        error: `${API_URL}${path} did not respond within ${TIMEOUT_MS / 1000}s.`,
      };
    }
    return {
      ok: false,
      status: 502,
      error: `Could not reach ${API_URL}${path} (${reason(error)}).`,
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

  try {
    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      error: `The platform API sent an unreadable body (${reason(error)}).`,
    };
  }
}
