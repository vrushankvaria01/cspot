import { NextResponse } from "next/server";

import { deleteCollaboration, updateCollaboration } from "@/lib/db";
import type { CollabStatus } from "@/lib/types";

export async function PATCH(
  request: Request,
  ctx: RouteContext<"/api/collaborations/[id]">,
) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updated = updateCollaboration(numId, {
    status: body.status as CollabStatus | undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  });
  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: Request,
  ctx: RouteContext<"/api/collaborations/[id]">,
) {
  const { id } = await ctx.params;
  const numId = Number(id);
  if (!Number.isInteger(numId)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const ok = deleteCollaboration(numId);
  if (!ok) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
