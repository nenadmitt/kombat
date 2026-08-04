import { NextResponse } from "next/server";

import { DuplicateEmailError, insertTesterSignup } from "@/lib/db";
import { clientIp, resolveCountry } from "@/lib/geo";
import {
  MAX_SIGNUPS_PER_DAY,
  recordSignup,
  signupsToday,
  tooManyRequests,
} from "@/lib/rate-limit";
import { visitorId, withVisitorCookie } from "@/lib/visitor";

const USERNAME = /^[a-zA-Z0-9_.-]{2,32}$/;

/**
 * Stricter than "something@something.something": rejects the shapes a real
 * mailbox never has (leading, trailing or doubled dots, a hyphen on either
 * end of a domain label, a numeric or one-letter TLD), so a typo bounces here
 * instead of becoming an invite that can never be delivered.
 */
const EMAIL =
  /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-zA-Z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;

export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";
  const visitor = visitorId(request);
  // Both keys are checked, so evading the cap costs a new address *and* a
  // cleared cookie rather than either one alone.
  const keys = [`ip:${ip}`, `v:${visitor}`];

  const reply = <T,>(body: T, init?: ResponseInit) =>
    withVisitorCookie(NextResponse.json(body, init), visitor);

  if (keys.some(tooManyRequests)) {
    return reply(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }
  if (keys.some(key => signupsToday(key) >= MAX_SIGNUPS_PER_DAY)) {
    return reply(
      {
        error: `That is ${MAX_SIGNUPS_PER_DAY} addresses from here today, which is the limit. Try again tomorrow.`,
      },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return reply({ error: "Invalid request." }, { status: 400 });
  }

  const { username, email } = (body ?? {}) as Record<string, unknown>;

  const cleanUsername = typeof username === "string" ? username.trim() : "";
  const cleanEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (cleanUsername && !USERNAME.test(cleanUsername)) {
    return reply(
      {
        error:
          "Username must be 2-32 characters, letters, numbers, dot, dash or underscore.",
      },
      { status: 400 },
    );
  }
  if (
    cleanEmail.length > 320 ||
    cleanEmail.split("@")[0]!.length > 64 ||
    !EMAIL.test(cleanEmail)
  ) {
    return reply(
      { error: "That does not look like an email address." },
      { status: 400 },
    );
  }

  const country = await resolveCountry(request.headers);

  try {
    await insertTesterSignup({
      username: cleanUsername || null,
      email: cleanEmail,
      country,
    });
  } catch (error) {
    if (error instanceof DuplicateEmailError) {
      // Already on the list is the same outcome the user wants, so it is not
      // an error worth surfacing as one.
      return reply({ ok: true, alreadyRegistered: true });
    }
    console.error("tester signup failed", error);
    return reply(
      { error: "Something went wrong. Try again." },
      { status: 500 },
    );
  }

  keys.forEach(recordSignup);
  return reply({ ok: true, alreadyRegistered: false });
}
