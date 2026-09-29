// Grading an answer the learner produced, without asking a model.
//
// Every phase today hands free text to the judge, which is right when the
// answer is reasoning and wrong when the answer is a *value*: "what is the
// determinant" has one correct reply, and paying a model call to compare two
// numbers is slower, costlier and less reliable than comparing them. The
// domain axis is what makes this addressable — `formal` answers are values,
// `performative` answers are utterances, and both can be checked here.
//
// Deliberately not an expression evaluator. It reads the shapes a learner
// actually types — an integer, a decimal, a fraction, a percentage, scientific
// notation — and anything else simply does not match. A CAS is the upgrade path
// if symbolic answers ever need grading; nothing here pretends to be one.

/** Comma decimals are not a typo — they are how half the app's users write a
 *  number, and pt-BR is one of the two shipped languages. */
const DECIMAL_COMMA = /^(-?\d+),(\d+)$/;

/** Digits in groups of three — `1,000`, `1.000`, `1.000,5`, `1,000.5`. The
 *  grouping mark repeats (`\2`); a decimal mark after it must be the other. */
const GROUPED = /^(-?\d{1,3}([.,])\d{3}(?:\2\d{3})*)(?:([.,])(\d+))?$/;

function ungroup(s: string): string | null {
  const g = GROUPED.exec(s);
  if (!g || g[3] === g[2]) return null;
  return g[1].replaceAll(g[2], "") + (g[4] ? `.${g[4]}` : "");
}

/**
 * Relative tolerance. 0.5% accepts 0.333 for 1/3 and rejects 0.33, which is
 * roughly where a human grader draws the line on a placement question.
 *
 * ponytail: one number for every formal answer. If a phase ever needs a
 * per-question tolerance, the generator returns it and this takes it as an
 * argument — the signature already does.
 */
export const NUMERIC_TOLERANCE = 5e-3;

/**
 * The number a learner's answer denotes, or null when it denotes none.
 * `grouped` reads separators as thousands instead: "1,000" is 1.0 as a comma
 * decimal and 1000 grouped, and only the question knows which — so
 * `checkNumeric` accepts either reading.
 */
export function parseNumber(raw: string, grouped = false): number | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  // Strip a trailing unit or currency the question already fixed — "12cm",
  // "$40" — so a right answer is not marked wrong for being labelled.
  //
  // Lowercase `r`, because `s` has already been lowercased two lines up: the
  // class used to name `R`, which could never match, so "R$ 40" was the one
  // currency the checker did not strip — in the language half this app's users
  // write in. Found porting this to Swift.
  s = s.replace(/^(?:r\$|[$€£])/, "").replace(/[a-z°%]*$/, (m) => (m === "%" ? "%" : ""));
  const percent = s.endsWith("%");
  if (percent) s = s.slice(0, -1);
  if (grouped) {
    const plain = ungroup(s);
    if (plain === null) return null;
    s = plain;
  }
  const comma = DECIMAL_COMMA.exec(s);
  if (comma) s = `${comma[1]}.${comma[2]}`;
  const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const d = Number(frac[2]);
    if (d === 0) return null;
    const v = Number(frac[1]) / d;
    return percent ? v / 100 : v;
  }
  // 3x10^2 and 3e2 are the same answer written two ways.
  const sci = /^(-?\d+(?:\.\d+)?)(?:x|\*)10\^?(-?\d+)$/.exec(s);
  if (sci) return Number(sci[1]) * 10 ** Number(sci[2]);
  if (!/^-?\d*\.?\d+(?:e-?\d+)?$/.test(s)) return null;
  const v = Number(s);
  if (!Number.isFinite(v)) return null;
  return percent ? v / 100 : v;
}

/** Every value the answer can denote: the plain reading and the grouped one. */
export function parseNumbers(raw: string): number[] {
  return [parseNumber(raw), parseNumber(raw, true)].filter(
    (v): v is number => v !== null,
  );
}

/** Does the learner's answer denote the expected value? */
export function checkNumeric(
  given: string,
  expected: string,
  tolerance = NUMERIC_TOLERANCE,
): boolean {
  // Relative everywhere except around zero, where relative error is undefined
  // and the tolerance has to be absolute.
  const near = (a: number, b: number) =>
    Math.abs(a - b) <= (b === 0 ? tolerance : Math.abs(b) * tolerance);
  const wanted = parseNumbers(expected);
  return parseNumbers(given).some((a) => wanted.some((b) => near(a, b)));
}

/**
 * What two utterances have to share to count as the same answer.
 *
 * Accents go because a learner speaking into dictation has no control over
 * whether the engine writes "está" or "esta", and punctuation goes for the
 * same reason. What survives is the words and their order — which is exactly
 * what a spoken production item is testing.
 */
export function normalizeText(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Did the learner produce one of the accepted answers? */
export function checkText(given: string, accept: readonly string[]): boolean {
  const g = normalizeText(given);
  return g.length > 0 && accept.some((a) => normalizeText(a) === g);
}

/** Did the learner put the items in the expected order? */
export function checkOrder(
  given: readonly string[],
  expected: readonly string[],
): boolean {
  return given.length === expected.length && given.every((id, i) => id === expected[i]);
}
