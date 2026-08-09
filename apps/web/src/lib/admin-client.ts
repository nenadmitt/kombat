"use client";

import {
  ADMIN_DENIED_HEADER,
  ADMIN_TOKEN_STORAGE_KEY,
  readAdminTokenFromUrl,
} from "./admin-token";

export type AdminFetchResult<T> =
  | { status: "ok"; data: T }
  | { status: "denied" }
  | { status: "error"; message: string };

/**
 * A token handed over in the URL is stored on the spot: reading it also strips
 * it, so a second caller in the same tick would otherwise find nothing.
 */
export function resolveAdminToken(): string | null {
  const fromUrl = readAdminTokenFromUrl();
  if (fromUrl) {
    window.localStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, fromUrl);
    return fromUrl;
  }
  return window.localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
}

export async function adminFetch<T>(
  path: string,
): Promise<AdminFetchResult<T>> {
  const token = resolveAdminToken();
  if (!token) {
    return { status: "denied" };
  }

  let response: Response;
  try {
    response = await fetch(path, {
      headers: { "x-admin-token": token },
      cache: "no-store",
    });
  } catch {
    return { status: "error", message: "Could not reach the server." };
  }

  if (response.headers.get(ADMIN_DENIED_HEADER)) {
    window.localStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    return { status: "denied" };
  }

  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
  };
  if (!response.ok) {
    return {
      status: "error",
      message: body.error ?? `That did not work (${response.status}).`,
    };
  }
  return { status: "ok", data: body as T };
}
