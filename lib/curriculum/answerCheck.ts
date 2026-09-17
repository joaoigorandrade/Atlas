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

/**
 * Relative tolerance. 0.5% accepts 0.333 for 1/3 and rejects 0.33, which is
 * roughly where a human grader draws the line on a placement question.
 *
 * ponytail: one number for every formal answer. If a phase ever needs a
 * per-question tolerance, the generator returns it and this takes it as an
 * argument — the signature already does.
 */
export const NUMERIC_TOLERANCE = 5e-3;

/** The number a learner's answer denotes, or null when it denotes none. */
export function parseNumber(raw: string): number | null {
  let s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;
  // Strip a trailing unit or currency the question already fixed — "12cm",
  // "$40" — so a right answer is not marked wrong for being labelled.
  s = s.replace(/^[$€£R]\$?/, "").replace(/[a-z°%]*$/, (m) => (m === "%" ? "%" : ""));
  const percent = s.endsWith("%");
  if (percent) s = s.slice(0, -1);
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

/** Does the learner's answer denote the expected value? */
export function checkNumeric(
  given: string,
  expected: string,
  tolerance = NUMERIC_TOLERANCE,
): boolean {
  const a = parseNumber(given);
  const b = parseNumber(expected);
  if (a === null || b === null) return false;
  // Relative everywhere except around zero, where relative error is undefined
  // and the tolerance has to be absolute.
  return Math.abs(a - b) <= (b === 0 ? tolerance : Math.abs(b) * tolerance);
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
