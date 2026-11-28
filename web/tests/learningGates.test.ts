// The rules that keep a phase from being passed by clicking, by waiting in the
// same sitting, or around an open gap — and the calibration readings that feed
// the curve. Each is silent when broken: the node just goes green too early.

import { describe, expect, it } from "vitest";
import {
  CONFIDENCE_FELT,
  mergeCalib,
  retainReducer,
  retainStart,
  runReading,
  type RetainContent,
} from "@/lib/curriculum";

describe("calibration readings", () => {
  it("is a running mean over every reading, not the last one doubled", () => {
    let samples = mergeCalib([], "n", 90, 0);
    samples = mergeCalib(samples, "n", 90, 0);
    samples = mergeCalib(samples, "n", 90, 90);
    expect(samples).toEqual([{ id: "n", felt: 90, real: 30, n: 3 }]);
    // A sample written before the count existed counts as one reading.
    expect(mergeCalib([{ id: "n", felt: 40, real: 40 }], "n", 80, 80)[0]).toEqual({
      id: "n",
      felt: 60,
      real: 60,
      n: 2,
    });
  });

  it("files a run's tap against the share it got right, once there is one", () => {
    expect(runReading(undefined, 3, 4)).toBeNull();
    expect(runReading(2, 0, 0)).toBeNull();
    expect(runReading(2, 3, 4)).toEqual({ felt: CONFIDENCE_FELT[2], real: 75 });
  });

  it("carries a review card's tap through the flip, and clears it for the next", () => {
    const content: RetainContent = {
      budgetMin: 5,
      cards: ["a", "b"].map((id) => ({
        id,
        type: "recall" as const,
        source: "",
        node: "n",
        back: "",
      })),
    };
    const flipped = retainReducer(retainStart(), { type: "flip", sure: 2 }, content);
    expect(flipped.sure).toBe(2);
    const next = retainReducer(flipped, { type: "grade", grade: "good" }, content);
    expect(next.sure).toBeUndefined();
  });
});
