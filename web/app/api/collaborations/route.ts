import { NextResponse } from "next/server";

import { getCollaborations } from "@/lib/db";

export async function GET() {
  return NextResponse.json(getCollaborations());
}
