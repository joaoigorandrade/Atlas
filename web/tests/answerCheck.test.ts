import { describe, expect, it } from "vitest";
import {
  checkNumeric,
  checkOrder,
  checkText,
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
  it("reads thousands separators in either language", () => {
    // "1,000" and "1.000" both read as 1.0 before — a right answer of 1000
    // marked wrong, the node Shaky, and a gap hung under it.
    expect(checkNumeric("1,000", "1000")).toBe(true);
    expect(checkNumeric("1.000", "1000")).toBe(true);
    expect(checkNumeric("1.000.000", "1000000")).toBe(true);
    expect(checkNumeric("1.234,5", "1234.5")).toBe(true);
    expect(checkNumeric("1,234.5", "1234.5")).toBe(true);
    // The decimal reading still stands where the question means it.
    expect(checkNumeric("1,5", "1.5")).toBe(true);
    expect(checkNumeric("1,000", "1")).toBe(true);
    // A repeated mark after the groups is neither reading.
    expect(checkNumeric("1,000,5", "1000.5")).toBe(false);
  });

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
