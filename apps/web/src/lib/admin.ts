import { timingSafeEqual } from "node:crypto";

/** An ADMIN_TOKEN shorter than this is refused as unsecured. */
const MIN_ADMIN_TOKEN_LENGTH = 10;

/**
 * True when the request carries the ADMIN_TOKEN env value in `x-admin-token`.
 * With no token configured, or one too weak to be meaningful, the admin
 * surface stays shut rather than falling open.
 */
export function isAdminRequest(headers: Headers): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < MIN_ADMIN_TOKEN_LENGTH) return false;

  const provided = headers.get("x-admin-token");
  if (typeof provided !== "string" || provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
