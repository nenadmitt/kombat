import type { RecipientLookup } from "@gaming-platform/core";

/** The NestJS platform API - a different service than this app's own /api. */
const API_URL =
  process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? "http://localhost:3000/api/v1";

export async function lookupRecipient(
  query: string,
  signal?: AbortSignal,
): Promise<RecipientLookup> {
  const response = await fetch(
    `${API_URL}/users/lookup?query=${encodeURIComponent(query)}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Lookup failed (${response.status})`);
  }
  return (await response.json()) as RecipientLookup;
}
