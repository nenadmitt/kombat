import { NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/admin";
import type { UserStatsRow } from "@/lib/admin-stats.types";
import { ADMIN_DENIED_HEADER } from "@/lib/admin-token";
import { platformAdminGet } from "@/lib/platform-admin";

export async function GET(request: Request) {
  if (!isAdminRequest(request.headers)) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { [ADMIN_DENIED_HEADER]: "1" } },
    );
  }

  const result = await platformAdminGet<UserStatsRow[]>("/admin/stats/users");
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ users: result.data });
}
