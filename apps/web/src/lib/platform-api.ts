import type { RecipientLookup } from "@gaming-platform/core";

// Inlined by `next build`, so the default must be the one that works in a browser.
const API_URL =
  process.env.NEXT_PUBLIC_PLATFORM_API_URL ?? "https://api.playkombat.xyz/api/v1";

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
