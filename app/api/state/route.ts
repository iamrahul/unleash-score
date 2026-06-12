import { NextRequest, NextResponse } from "next/server";
import { readState, writeState, type ScoreState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const state = await readState();
  return NextResponse.json(state, {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: NextRequest) {
  let body: Partial<ScoreState>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const patch: Partial<Omit<ScoreState, "v">> = {};

  if (typeof body.title === "string") patch.title = body.title.slice(0, 40);
  if (typeof body.label === "string") patch.label = body.label.slice(0, 40);

  if (Array.isArray(body.teams) && body.teams.length === 2) {
    patch.teams = body.teams.map((t) => ({
      name: String(t?.name ?? "").slice(0, 24),
      score: clampScore(t?.score),
    })) as ScoreState["teams"];
  }

  const next = await writeState(patch);
  return NextResponse.json(next, {
    headers: { "Cache-Control": "no-store" },
  });
}

function clampScore(v: unknown): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(9999, n));
}
