import { NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/admin";
import { listTesterSignups } from "@/lib/db";

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
