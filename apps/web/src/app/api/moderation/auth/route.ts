import { NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/admin";

export async function GET(request: Request) {
  if (!isAdminRequest(request.headers)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
