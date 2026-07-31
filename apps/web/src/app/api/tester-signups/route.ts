import { NextResponse } from "next/server";

import { DuplicateEmailError, insertTesterSignup } from "@/lib/db";
import { clientIp, resolveCountry } from "@/lib/geo";
import { tooManyRequests } from "@/lib/rate-limit";

const USERNAME = /^[a-zA-Z0-9_.-]{2,32}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: Request) {
  const ip = clientIp(request.headers) ?? "unknown";
  if (tooManyRequests(ip)) {
    return NextResponse.json(
      { error: "Too many requests. Try again in a minute." },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const { username, email } = (body ?? {}) as Record<string, unknown>;

  const cleanUsername = typeof username === "string" ? username.trim() : "";
  const cleanEmail =
    typeof email === "string" ? email.trim().toLowerCase() : "";

  if (cleanUsername && !USERNAME.test(cleanUsername)) {
    return NextResponse.json(
      {
        error:
          "Username must be 2-32 characters, letters, numbers, dot, dash or underscore.",
      },
      { status: 400 },
    );
  }
  if (!EMAIL.test(cleanEmail) || cleanEmail.length > 320) {
    return NextResponse.json(
      { error: "Enter a valid email address." },
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
      return NextResponse.json({ ok: true, alreadyRegistered: true });
    }
    console.error("tester signup failed", error);
    return NextResponse.json(
      { error: "Something went wrong. Try again." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, alreadyRegistered: false });
}
