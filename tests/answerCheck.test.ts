import { describe, expect, it } from "vitest";
import {
  checkNumeric,
  checkOrder,
  checkText,
  gradeDiagnostic,
  normalizeText,
  parseNumber,
} from "@/lib/curriculum";

describe("parseNumber", () => {
  it("reads the shapes a learner actually types", () => {
    expect(parseNumber("42")).toBe(42);
    expect(parseNumber("-3.5")).toBe(-3.5);
    expect(parseNumber("3/4")).toBe(0.75);
    expect(parseNumber("  7 ")).toBe(7);
  });

  it("reads a comma decimal — half the app's users write one", () => {
    // pt-BR is a shipped language, so "0,75" is a correct answer, not a typo.
    expect(parseNumber("0,75")).toBe(0.75);
    expect(parseNumber("-1,5")).toBe(-1.5);
  });

  it("reads percentages as their value", () => {
    expect(parseNumber("50%")).toBe(0.5);
    expect(parseNumber("12.5%")).toBe(0.125);
  });

  it("reads both spellings of scientific notation", () => {
    expect(parseNumber("3e2")).toBe(300);
    expect(parseNumber("3x10^2")).toBe(300);
    expect(parseNumber("3*10^-2")).toBeCloseTo(0.03, 10);
  });

  it("does not mark a right answer wrong for carrying its unit", () => {
    expect(parseNumber("12cm")).toBe(12);
    expect(parseNumber("$40")).toBe(40);
    // The class named an uppercase `R` after the string had been lowercased, so
    // the real — the currency of one of the two shipped languages — was the one
    // it never stripped. Found porting this to Swift.
    expect(parseNumber("R$ 40")).toBe(40);
    expect(parseNumber("r$40")).toBe(40);
    // And a bare leading `r` is still not a currency: "r2" denotes no number.
    expect(parseNumber("r2")).toBeNull();
  });

  it("returns null rather than guessing at something that is not a number", () => {
    for (const junk of ["", "   ", "about seven", "3/0", "--4", "x²"])
      expect(parseNumber(junk), junk).toBeNull();
  });
});

describe("checkNumeric", () => {
  it("accepts the same value written differently", () => {
    expect(checkNumeric("0.75", "3/4")).toBe(true);
    expect(checkNumeric("0,75", "3/4")).toBe(true);
    expect(checkNumeric("300", "3x10^2")).toBe(true);
  });

  it("draws the tolerance where a human grader would", () => {
    // 0.333 is 0.1% off 1/3 and passes; 0.33 is 1% off and does not.
    expect(checkNumeric("0.333", "1/3")).toBe(true);
    expect(checkNumeric("0.33", "1/3")).toBe(false);
  });

  it("uses an absolute tolerance around zero, where relative error is undefined", () => {
    expect(checkNumeric("0", "0")).toBe(true);
    expect(checkNumeric("0.004", "0")).toBe(true);
    expect(checkNumeric("1", "0")).toBe(false);
  });

  it("is false, never throwing, when either side is not a number", () => {
    expect(checkNumeric("dunno", "4")).toBe(false);
    expect(checkNumeric("4", "dunno")).toBe(false);
  });
});

describe("checkText", () => {
  it("ignores what dictation has no control over", () => {
    // The engine's choice of accent or punctuation is not the learner's error.
    expect(checkText("Está bien.", ["esta bien"])).toBe(true);
    expect(checkText("  ¿dónde  está?  ", ["donde esta"])).toBe(true);
  });

  it("still requires the words, and their order", () => {
    expect(checkText("bien esta", ["esta bien"])).toBe(false);
    expect(checkText("esta", ["esta bien"])).toBe(false);
  });

  it("takes any of several accepted answers", () => {
    expect(checkText("carro", ["coche", "carro", "auto"])).toBe(true);
  });

  it("never passes an empty answer", () => {
    expect(checkText("", [""])).toBe(false);
    expect(checkText("   ", ["esta bien"])).toBe(false);
  });

  it("normalizes to words and spaces only", () => {
    expect(normalizeText("¡Sí — ya está!")).toBe("si ya esta");
  });
});

describe("checkOrder", () => {
  it("is the chronology probe: same items, same sequence", () => {
    expect(checkOrder(["a", "b", "c"], ["a", "b", "c"])).toBe(true);
    expect(checkOrder(["a", "c", "b"], ["a", "b", "c"])).toBe(false);
    expect(checkOrder(["a", "b"], ["a", "b", "c"])).toBe(false);
  });
});

describe("gradeDiagnostic", () => {
  const base = {
    tag: "t",
    q: "q",
    note: "n",
    nodeId: "eigen",
    difficulty: "medium" as const,
    opts: [],
    correctIndex: -1,
  };

  it("grades a four-option question by the option picked", () => {
    const q = { ...base, type: "mcq" as const, correctIndex: 2 };
    expect(gradeDiagnostic(q, 2)).toBe(true);
    expect(gradeDiagnostic(q, 0)).toBe(false);
  });

  it("reads a question written before the axis as a four-option one", () => {
    // Every placement already stored has no `type`; it must keep grading.
    const q = { ...base, correctIndex: 1 };
    expect(gradeDiagnostic(q, 1)).toBe(true);
    expect(gradeDiagnostic(q, 3)).toBe(false);
  });

  it("grades a computed answer by value, not by spelling", () => {
    const q = { ...base, type: "compute" as const, expected: ["3/4"] };
    expect(gradeDiagnostic(q, "0.75")).toBe(true);
    expect(gradeDiagnostic(q, "0,75")).toBe(true);
    expect(gradeDiagnostic(q, "0.8")).toBe(false);
  });

  it("grades a spoken answer against every accepted utterance", () => {
    const q = { ...base, type: "speak" as const, expected: ["esta bien", "todo bien"] };
    expect(gradeDiagnostic(q, "Está bien.")).toBe(true);
    expect(gradeDiagnostic(q, "todo bien")).toBe(true);
    expect(gradeDiagnostic(q, "no se")).toBe(false);
  });

  it("grades a chronology by the sequence", () => {
    const q = {
      ...base,
      type: "order" as const,
      expected: ["Nicaea", "Schism", "Trent"],
    };
    expect(gradeDiagnostic(q, ["Nicaea", "Schism", "Trent"])).toBe(true);
    expect(gradeDiagnostic(q, ["Schism", "Nicaea", "Trent"])).toBe(false);
  });

  it("is wrong, never a throw, when the answer is the wrong shape for its kind", () => {
    // This runs on the onboarding path; a bad client answer must not crash it.
    expect(gradeDiagnostic({ ...base, type: "compute", expected: ["4"] }, 4)).toBe(false);
    expect(gradeDiagnostic({ ...base, type: "mcq", correctIndex: 0 }, "0")).toBe(false);
    expect(gradeDiagnostic({ ...base, type: "order" }, ["a"])).toBe(false);
    expect(gradeDiagnostic({ ...base, type: "speak" }, "anything")).toBe(false);
  });
});
