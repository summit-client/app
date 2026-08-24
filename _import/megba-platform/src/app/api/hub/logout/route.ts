import { NextResponse } from "next/server";
import { destroyHubSession } from "@/lib/hub/session";

export const runtime = "nodejs";

export async function POST() {
  await destroyHubSession();
  return NextResponse.json({ ok: true });
}
