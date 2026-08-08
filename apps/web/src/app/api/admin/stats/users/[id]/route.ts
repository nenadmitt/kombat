import { NextResponse } from "next/server";

import { isAdminRequest } from "@/lib/admin";
import type { UserStats } from "@/lib/admin-stats.types";
import { ADMIN_DENIED_HEADER } from "@/lib/admin-token";
import { platformAdminGet } from "@/lib/platform-admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!isAdminRequest(request.headers)) {
    return NextResponse.json(
      { error: "Not found" },
      { status: 404, headers: { [ADMIN_DENIED_HEADER]: "1" } },
    );
  }

  const { id } = await params;
  if (!UUID.test(id)) {
    return NextResponse.json({ error: "Invalid user id." }, { status: 400 });
  }

  const result = await platformAdminGet<UserStats>(`/admin/stats/users/${id}`);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.status === 404 ? "User not found." : result.error },
      { status: result.status },
    );
  }
  return NextResponse.json(result.data);
}
