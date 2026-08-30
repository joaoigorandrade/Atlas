import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A reasoning model (deepseek-v4-flash, r1, …) streams `delta.reasoning` for a
// while before the first `delta.content`. Those deltas are not content and are
// never yielded, but they are proof the model is alive: without them disarming
// the FIRST_TOKEN_MS bomb, every map build on such a model aborts mid-think and
// the learner is told the map could not be built.

const FIRST_TOKEN_MS = 300;

const sse = (delta: Record<string, string>) =>
  `data: ${JSON.stringify({ choices: [{ delta }] })}\n\n`;

let server: Server;

beforeAll(async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_FIRST_TOKEN_MS = String(FIRST_TOKEN_MS);
  server = createServer(async (_req, res) => {
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    // Think out loud for twice the silence deadline, then write.
    for (let i = 0; i < 6; i++) {
      res.write(sse({ reasoning: `thinking ${i} ` }));
      await new Promise((r) => setTimeout(r, FIRST_TOKEN_MS / 2));
    }
    res.write(sse({ content: '{"id":"n0","label":"Concept"}' }));
    res.write("data: [DONE]\n\n");
    res.end();
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("the first-token deadline", () => {
  it("is disarmed by reasoning deltas, so a thinking model still delivers", async () => {
    const { streamJsonObjects } = await import("@/lib/server/openrouter");
    const out: unknown[] = [];
    for await (const item of streamJsonObjects([{ role: "user", content: "map" }], (raw) => raw))
      out.push(item);
    expect(out).toEqual([{ id: "n0", label: "Concept" }]);
  });
});
