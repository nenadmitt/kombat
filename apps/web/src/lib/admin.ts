import { timingSafeEqual } from "node:crypto";

const MIN_ADMIN_TOKEN_LENGTH = 10;

export function isAdminRequest(headers: Headers): boolean {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length < MIN_ADMIN_TOKEN_LENGTH) return false;

  const provided = headers.get("x-admin-token");
  if (typeof provided !== "string" || provided.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
}
