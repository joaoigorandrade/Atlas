import { expect, it } from "vitest";
import { PART_OF_WORK } from "@/lib/server/generate/mapSyllabus";

// A named chapter is grounded in its own sections whatever the goal; a plain
// topic is not, so ordinary mastery and Pareto maps keep their one call.
it("tells a named part of a work from a plain topic", () => {
  for (const t of [
    "Capítulo 2 circuitos elétricos nilsson e riedel",
    "Nilsson cap 2",
    "Ch.2 circuits",
    "Lecture 5 MIT 18.06",
  ])
    expect(PART_OF_WORK.test(t), t).toBe(true);
  for (const t of [
    "Linear algebra",
    "Unit testing in Python",
    "Python 3 basics",
    "Probabilidade",
  ])
    expect(PART_OF_WORK.test(t), t).toBe(false);
});
