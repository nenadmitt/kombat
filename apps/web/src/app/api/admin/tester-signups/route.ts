import { NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/admin";
import {
  deleteTesterSignups,
  listTesterSignups,
  setTesterSignupsInvited,
} from "@/lib/db";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_IDS = 1000;

function readIds(body: unknown): string[] | null {
  const raw = (body as { ids?: unknown })?.ids;
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_IDS) {
    return null;
  }
  const ids = raw.filter(
    (id): id is string => typeof id === "string" && UUID.test(id),
  );
  return ids.length === raw.length ? ids : null;
}

export async function GET(request: Request) {
  if (!isAdminRequest(request.headers)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    return NextResponse.json({ signups: await listTesterSignups() });
  } catch (error) {
    console.error("listing tester signups failed", error);
    return NextResponse.json(
      { error: "Could not load signups." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  if (!isAdminRequest(request.headers)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let ids: string[] | null;
  try {
    ids = readIds(await request.json());
  } catch {
    ids = null;
  }
  if (!ids) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    return NextResponse.json({ deleted: await deleteTesterSignups(ids) });
  } catch (error) {
    console.error("deleting tester signups failed", error);
    return NextResponse.json(
      { error: "Could not delete those signups." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  if (!isAdminRequest(request.headers)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const ids = readIds(body);
  const invited = (body as { invited?: unknown })?.invited;
  if (!ids || typeof invited !== "boolean") {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  try {
    return NextResponse.json({
      updated: await setTesterSignupsInvited(ids, invited),
    });
  } catch (error) {
    console.error("marking tester signups failed", error);
    return NextResponse.json(
      { error: "Could not update those signups." },
      { status: 500 },
    );
  }
}
