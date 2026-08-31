import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A model that answers nothing costs a whole REQUEST_MS to find out, and a
// retry on it costs another. Three of those in a row spent the entire route
// budget (`maxDuration` in app/api/generate/route.ts) without ever reaching the
// second model in the chain — which is the failure that stopped maps like
// "Derivadas" from ever being built. A timeout must skip straight to the next
// model instead.

const REQUEST_MS = 300;
/** The model that hangs — every request to it is left to time out. */
const DEAD = "test/dead-model";
const ALIVE = "test/live-model";

let server: Server;
const calls: string[] = [];

beforeAll(async () => {
  process.env.OPENROUTER_API_KEY = "test-key";
  process.env.OPENROUTER_TIMEOUT_MS = String(REQUEST_MS);
  process.env.OPENROUTER_MODEL = DEAD;
  process.env.OPENROUTER_FALLBACK_MODEL = ALIVE;
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const { model } = JSON.parse(body) as { model: string };
      calls.push(model);
      // The dead model never writes a byte: the client's own deadline is the
      // only thing that ends this request.
      if (model === DEAD) return;
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          choices: [{ message: { content: '{"ok":true}' } }],
        }),
      );
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("a model that times out", () => {
  it("is dropped for the next model in the chain, not retried", async () => {
    const { generateJson } = await import("@/lib/server/openrouter");
    await expect(
      generateJson([{ role: "user", content: "map" }], (raw) => raw),
    ).resolves.toEqual({ ok: true });
    // One attempt at the dead model — never the delay ladder's three — and
    // then the model that actually answers.
    expect(calls).toEqual([DEAD, ALIVE]);
  });
});
