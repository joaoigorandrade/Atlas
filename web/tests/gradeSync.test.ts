// The grade queue's one subtle rule: a refused grade leaves nothing of ours to
// undo, so an undo queued behind it must not go — sent, the server would take
// back the review that beat ours (the other device's).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: string[] = [];
vi.mock("@/lib/reviewApi", () => ({
  postGrade: vi.fn(async () => {
    sent.push("grade");
    return { card: { id: "c1" }, conflict: true };
  }),
  undoGradeRemote: vi.fn(async () => {
    sent.push("undo");
    return { card: { id: "c1" } };
  }),
}));

import { createGradeSync } from "@/components/atlas/gradeSync";

beforeEach(() => {
  sent.length = 0;
  const store = new Map<string, string>();
  vi.stubGlobal("window", {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal("document", {
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("grade sync", () => {
  it("drops the undo queued behind a refused grade, and says it was refused", async () => {
    const adopted: boolean[] = [];
    const sync = createGradeSync((_t, _c, refused) => adopted.push(refused));
    const grade = {
      kind: "grade" as const,
      topicId: "t",
      cardId: "c1",
      grade: "good" as const,
      reviewedAt: new Date().toISOString(),
      expectReps: 0,
    };
    sync.push(grade);
    sync.push({ kind: "undo", topicId: "t", cardId: "c1" });
    await vi.waitFor(() =>
      expect(localStorage.getItem("atlas:pending-grades")).toBeNull(),
    );
    expect(sent).toEqual(["grade"]);
    expect(adopted).toEqual([true]);
    sync.dispose();
  });
});
