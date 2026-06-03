import { NextResponse } from "next/server";

import { createEvent, getEvents } from "@/lib/db";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date") ?? undefined;
  const from = searchParams.get("from") ?? undefined;
  const to = searchParams.get("to") ?? undefined;
  return NextResponse.json(getEvents({ date, from, to }));
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body.title !== "string" || !body.title.trim()) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }
  if (typeof body.date !== "string" || !DATE_RE.test(body.date)) {
    return NextResponse.json(
      { error: "A valid date (YYYY-MM-DD) is required" },
      { status: 400 },
    );
  }

  const event = createEvent({
    title: body.title,
    type: body.type,
    date: body.date,
    start_time: body.start_time ?? null,
    end_time: body.end_time ?? null,
    all_day: body.all_day,
    location: typeof body.location === "string" ? body.location : undefined,
    notes: typeof body.notes === "string" ? body.notes : undefined,
  });
  return NextResponse.json(event, { status: 201 });
}
