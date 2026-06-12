import { readState } from "@/lib/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Server-Sent Events: pushes the score state to connected displays.
// Polls the store frequently and only emits when the version changes.
// EventSource on the client auto-reconnects when the function recycles.
export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastV = -1;
      let closed = false;

      const send = (data: string) => {
        if (!closed) controller.enqueue(encoder.encode(data));
      };

      const tick = async () => {
        try {
          const state = await readState();
          if (state.v !== lastV) {
            lastV = state.v;
            send(`data: ${JSON.stringify(state)}\n\n`);
          } else {
            send(`: ping\n\n`);
          }
        } catch {
          // swallow and keep the stream alive
        }
      };

      await tick();
      const interval = setInterval(tick, 500);

      // Close cleanly near the function's max duration.
      const stop = setTimeout(() => {
        closed = true;
        clearInterval(interval);
        clearTimeout(stop);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }, 55_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
