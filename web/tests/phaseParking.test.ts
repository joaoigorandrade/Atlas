// Reading a parked session back, and forgetting it once the rung closes.
//
// The store is one object per node keyed by phase id, shared by every phase
// built after the catalogue — so the thing worth pinning is that a phase only
// ever touches its own slot. A drop that took the whole node's record with it
// would close one rung and silently discard a different phase's unfinished
// work, which is the failure this shape exists to make impossible.

import { describe, expect, it, vi } from "vitest";
import { dropParked, parkedSession } from "@/components/atlas/phaseParking";
import type { PhaseProgress } from "@/lib/curriculum";

type Store = Record<string, PhaseProgress>;

/** `setPhaseProgress` is a React setter; this runs the updater and hands back
 *  what it produced, which is all these helpers touch. */
function applied(before: Store, run: (set: never) => void): Store {
  let after = before;
  const set = vi.fn((update: (prev: Store) => Store) => {
    after = update(after);
  });
  run(set as never);
  return after;
}

const store: Store = {
  n1: {
    crucible: { nodeId: "n1", attempt: "my transfer" },
    perform: { nodeId: "n1", work: "my run" },
  },
  n2: { crucible: { nodeId: "n2", attempt: "other node" } },
};

describe("parkedSession", () => {
  it("reads back the slot a phase parked", () => {
    expect(parkedSession(store, "n1", "crucible")).toEqual({
      nodeId: "n1",
      attempt: "my transfer",
    });
  });

  it("is undefined for a node or a phase with nothing parked", () => {
    expect(parkedSession(store, "n1", "drill")).toBeUndefined();
    expect(parkedSession(store, "nobody", "crucible")).toBeUndefined();
    // The caller falls back to a fresh session on undefined, so a store that
    // has never been written must not throw its way there.
    expect(parkedSession({}, "n1", "crucible")).toBeUndefined();
  });
});

describe("dropParked", () => {
  it("forgets one phase and leaves the node's other phases alone", () => {
    const after = applied(store, (set) => dropParked(set, "n1", "crucible"));
    expect(after.n1.crucible).toBeUndefined();
    expect(after.n1.perform).toEqual({ nodeId: "n1", work: "my run" });
  });

  it("leaves other nodes untouched", () => {
    const after = applied(store, (set) => dropParked(set, "n1", "crucible"));
    expect(after.n2).toEqual(store.n2);
  });

  it("is a no-op when there was nothing parked", () => {
    // Returning the same object is what keeps a drop that changed nothing off
    // the save debounce — an advance past a phase nobody parked must not
    // queue a write for every node it touches.
    const after = applied(store, (set) => dropParked(set, "n1", "drill"));
    expect(after).toBe(store);
    expect(applied(store, (set) => dropParked(set, "ghost", "crucible"))).toBe(store);
  });
});
