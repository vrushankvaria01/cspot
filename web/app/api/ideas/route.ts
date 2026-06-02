import { NextResponse } from "next/server";

import { createIdea, getIdeas } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getIdeas());
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  const idea = createIdea({
    title: body.title.trim(),
    status: body.status,
    notes: typeof body.notes === "string" ? body.notes : undefined,
    inspiration_url:
      typeof body.inspiration_url === "string"
        ? body.inspiration_url.trim()
        : undefined,
  });
  return NextResponse.json(idea, { status: 201 });
}
