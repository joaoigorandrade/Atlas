import { describe, expect, it } from "vitest";
import { createWarmQueue } from "@/lib/warm";

/** A task whose settling this test controls. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe("warm queue", () => {
  it("runs a key once, however many callers ask for it", async () => {
    const queue = createWarmQueue();
    let calls = 0;
    const task = async () => {
      calls++;
      return "content";
    };

    const [a, b] = await Promise.all([
      queue.run("consume:n1", task),
      queue.run("consume:n1", task),
    ]);

    expect(calls).toBe(1);
    expect(a).toBe("content");
    expect(b).toBe("content");
  });

  it("lets a click join a warm already in flight instead of paying twice", async () => {
    const queue = createWarmQueue();
    const gate = deferred<string>();
    let calls = 0;

    queue.warm("consume:n1", () => {
      calls++;
      return gate.promise;
    });
    await tick();

    // The learner clicks through mid-warm: same request, no second charge.
    const clicked = queue.run("consume:n1", async () => "second generation", true);
    gate.resolve("warmed content");

    expect(await clicked).toBe("warmed content");
    expect(calls).toBe(1);
  });

  it("starts a queued warm immediately when a click needs it", async () => {
    const queue = createWarmQueue();
    const blockers = [deferred<string>(), deferred<string>()];
    // Fill both concurrency slots so the third stays queued.
    queue.warm("a", () => blockers[0].promise);
    queue.warm("b", () => blockers[1].promise);

    let startedThird = false;
    queue.warm("c", async () => {
      startedThird = true;
      return "c";
    });
    await tick();
    expect(startedThird).toBe(false);

    const clicked = queue.run("c", async () => "unused", true);
    expect(await clicked).toBe("c");
    expect(startedThird).toBe(true);

    blockers.forEach((b) => b.resolve("done"));
  });

  it("caps concurrent background work", async () => {
    const queue = createWarmQueue();
    const gates = [deferred<string>(), deferred<string>(), deferred<string>()];
    let started = 0;

    gates.forEach((gate, i) =>
      queue.warm(`k${i}`, () => {
        started++;
        return gate.promise;
      }),
    );
    await tick();
    expect(started).toBe(2);

    gates[0].resolve("one");
    await tick();
    expect(started).toBe(3);

    gates[1].resolve("two");
    gates[2].resolve("three");
  });

  it("forgets a failed key so a real click can retry and see the error", async () => {
    const queue = createWarmQueue();
    queue.warm("consume:n1", async () => {
      throw new Error("the writer is busy");
    });
    await tick();
    expect(queue.has("consume:n1")).toBe(false);

    await expect(
      queue.run("consume:n1", async () => {
        throw new Error("the writer is busy");
      }),
    ).rejects.toThrow("the writer is busy");
  });

  it("drops every key when the map is rebuilt", async () => {
    const queue = createWarmQueue();
    await queue.run("consume:n1", async () => "content");
    expect(queue.has("consume:n1")).toBe(true);
    queue.clear();
    expect(queue.has("consume:n1")).toBe(false);
  });
});
