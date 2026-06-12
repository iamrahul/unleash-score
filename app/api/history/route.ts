import { NextRequest, NextResponse } from "next/server";
import { readHistory } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// GET /api/history?limit=100 — durable, append-only log of every saved state,
// newest first. A safety net so past scores are never lost.
export async function GET(req: NextRequest) {
  const limitParam = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Number.isFinite(limitParam)
    ? Math.max(1, Math.min(1000, limitParam))
    : 100;

  const entries = await readHistory(limit);
  return NextResponse.json(
    { count: entries.length, entries },
    { headers: { "Cache-Control": "no-store" } }
  );
}
