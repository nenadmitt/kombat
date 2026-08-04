import { randomUUID } from "node:crypto";
import type { NextResponse } from "next/server";

export const VISITOR_COOKIE = "kmbt_v";

/** Long enough that clearing it is a deliberate act, not a session artifact. */
const MAX_AGE_SECONDS = 400 * 24 * 60 * 60;

/**
 * A per-browser id used only as a second throttle key. An IP alone is both too
 * broad (a whole office shares one) and too easy to change (phone data, VPN);
 * pairing it with a cookie makes each limit cost the other side something to
 * evade. It identifies a browser, never a person, and is not stored anywhere.
 */
export function visitorId(request: Request): string {
  const cookies = request.headers.get("cookie");
  if (cookies) {
    for (const part of cookies.split(";")) {
      const [name, ...rest] = part.trim().split("=");
      if (name === VISITOR_COOKIE && rest.length) {
        const value = rest.join("=").trim();
        if (value) return value;
      }
    }
  }
  return randomUUID();
}

export function withVisitorCookie<T>(
  response: NextResponse<T>,
  id: string,
): NextResponse<T> {
  response.cookies.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
  return response;
}
