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

// Upstash Redis when configured (Vercel / production), otherwise an
// in-memory fallback so local dev works with zero setup.
const hasRedis =
  !!process.env.UPSTASH_REDIS_REST_URL &&
  !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = hasRedis ? Redis.fromEnv() : null;

let memory: ScoreState = { ...DEFAULT_STATE };

export async function readState(): Promise<ScoreState> {
  if (redis) {
    const s = await redis.get<ScoreState>(KEY);
    return s ?? DEFAULT_STATE;
  }
  return memory;
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
  if (redis) {
    await redis.set(KEY, next);
  } else {
    memory = next;
  }
  return next;
}
