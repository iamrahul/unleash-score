# Unleash Score

A fullscreen, live scoreboard UI for **Supercode Unleash**. Type a score on any
device and every connected display updates in real time.

![Scoreboard](https://img.shields.io/badge/status-live-5fd11a)

## How it works

- **Fullscreen display** — bright-green board matching the event design, with two
  team columns, big tabular scores, and a round label.
- **Cross-device real-time** — state lives in Upstash Redis and is pushed to
  every client over Server-Sent Events (with a polling fallback). Update on a
  phone, the big screen follows within a fraction of a second.
- **Inline editing** — unlock with the `L` key (or the button, bottom-right),
  then click any score to type, use the `+ / −` steppers, or keyboard shortcuts.

### Keyboard shortcuts (when unlocked)

| Key | Action            |
| --- | ----------------- |
| `Q` / `A` | Left team +1 / −1 |
| `P` / `L` | Right team +1 / −1 |
| `R` | Reset both scores |
| `E` | Toggle edit / lock |
| `F` | Toggle fullscreen |

Add `?edit=1` to the URL to open straight into edit mode.

## Tech

Next.js (App Router) · React 19 · Upstash Redis · Server-Sent Events · deployed
on Vercel.

## Local development

```bash
npm install
npm run dev
```

Without Upstash env vars set, it falls back to an in-memory store (single
instance) so you can develop locally with zero setup. In production set:

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

## Deploy

Connected to Vercel via GitHub — merges to `main` ship to production.
