import { Redis } from "@upstash/redis";

export type ScoreState = {
  title: string;
  label: string;
  teams: [
    { name: string; score: number },
    { name: string; score: number }
  ];
  v: number; // version, bumped on every write
};

export type HistoryEntry = ScoreState & { at: number };

export const DEFAULT_STATE: ScoreState = {
  title: "SCORE BOARD",
  label: "WEEK 1",
  teams: [
    { name: "CoreX", score: 0 },
    { name: "SuperZ", score: 0 },
  ],
  v: 0,
};

const KEY = "unleash-score:state";
const HISTORY_KEY = "unleash-score:history";
const HISTORY_MAX = 1000; // keep the last N snapshots

// Upstash Redis when configured (Vercel / production), otherwise an
// in-memory fallback so local dev works with zero setup.
// Supports both the Vercel KV-provisioned vars (KV_REST_API_*) and the
// native Upstash vars (UPSTASH_REDIS_REST_*).
const REDIS_URL =
  process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN =
  process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const redis =
  REDIS_URL && REDIS_TOKEN
    ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
    : null;

let memory: ScoreState = { ...DEFAULT_STATE };
// In-process cache of the last value we know to be good. Used so a transient
// Redis hiccup never makes us report a reset (0-0) and overwrite real scores.
let lastGood: ScoreState | null = null;

// Run a Redis op with one retry, so a single transient network blip doesn't
// surface as a failure.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch {
    await new Promise((r) => setTimeout(r, 120));
    return await fn();
  }
}

export async function readState(): Promise<ScoreState> {
  if (!redis) return memory;
  try {
    const s = await withRetry(() => redis.get<ScoreState>(KEY));
    if (s) {
      lastGood = s;
      return s;
    }
    // Genuine empty key (first run): prefer last-known over defaults.
    return lastGood ?? DEFAULT_STATE;
  } catch {
    // Never reset to zero on an error — keep the last value we trust.
    return lastGood ?? DEFAULT_STATE;
  }
}

export async function writeState(
  patch: Partial<Omit<ScoreState, "v">>
): Promise<ScoreState> {
  const current = await readState();
  const next: ScoreState = {
    ...current,
    ...patch,
    teams: patch.teams ?? current.teams,
    v: Date.now(),
  };

  if (!redis) {
    memory = next;
    lastGood = next;
    return next;
  }

  // Persist the current state (with retry).
  await withRetry(() => redis.set(KEY, next));
  lastGood = next;

  // Append a snapshot to the durable, capped history log. Best-effort: a
  // history failure must never fail the score write.
  try {
    const entry: HistoryEntry = { ...next, at: next.v };
    await redis.lpush(HISTORY_KEY, JSON.stringify(entry));
    await redis.ltrim(HISTORY_KEY, 0, HISTORY_MAX - 1);
  } catch {
    /* ignore — the live state is already saved */
  }

  return next;
}

export async function readHistory(limit = 100): Promise<HistoryEntry[]> {
  if (!redis) return [];
  try {
    const raw = await withRetry(() =>
      redis.lrange<HistoryEntry | string>(HISTORY_KEY, 0, Math.max(0, limit - 1))
    );
    return raw
      .map((item) => {
        if (typeof item === "string") {
          try {
            return JSON.parse(item) as HistoryEntry;
          } catch {
            return null;
          }
        }
        return item as HistoryEntry;
      })
      .filter((x): x is HistoryEntry => !!x);
  } catch {
    return [];
  }
}
