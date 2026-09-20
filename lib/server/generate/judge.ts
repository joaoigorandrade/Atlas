// ---- kind: judge -----------------------------------------------------------
// The live judging loop (#25-#27): the learner's own words, classified by a
// (configurably stronger) judge model. Anti-sycophancy is enforced in the
// prompt: wrong reasoning is named plainly, never affirmed.
import { VERDICTS } from "./feynman";

import { arr, fail, languageNote, obj, oneOf, str } from "./common";
import { Language } from "@/lib/i18n";
import { ChatMessage, generateJson } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";
import { MATH_RULE } from "./common";
import { judgeStream } from "./judgeStream";

export { judgeStream } from "./judgeStream";

export const JUDGE_SYSTEM: ChatMessage = {
  role: "system",
  content:
    "You judge a learner's answer in a mastery-learning app. You are rigorous and anti-sycophantic: " +
    "a wrong answer is named plainly and specifically (quote the wrong part), never affirmed or smoothed over. " +
    "A near-miss earns a hint, never the full answer. Empty, evasive, or off-topic input is never treated as correct. " +
    "Reply with ONLY one valid JSON object. " +
    MATH_RULE,
};

/**
 * Judging, verdict-first.
 *
 * The judge is the one generation that can never be cached — it grades one
 * learner's own words — and the one the learner meets most often, so its
 * latency is felt more than anything else in the app. The verdict is ~15
 * tokens; the critique that follows it is the long part. Asking for them as
 * two separate top-level objects lets the UI unblock on the first (the tutor
 * advances, the mastery write lands, the input reopens) while the critique is
 * still being written.
 *
 * `AGENTS.md` forbids streaming a call that needs a corrective retry — and the
 * judge does. That constraint is kept, not broken: this only *starts* on the
 * stream. If the full object never validates, the retried single-shot
 * `generateJson` still produces it, and the client patches the streamed
 * placeholder with the real thing. The verdict is never invented locally.
 */
/** What the three rubric judges (Feynman, Recall, Perform) ask for as object 1. */
export const VERDICT_FIRST_SHAPE =
  `{"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one entry per rubric row]}` +
  ` — ONE object holding every row inside its "verdicts" array, in rubric order.` +
  ` Never one object per row.`;

/**
 * Reads object 1 for the three rubric judges, in either shape the model
 * actually sends.
 *
 * It was asked for `{"verdicts": [...]}` and sent one top-level object *per
 * row* instead — `{"i":0,…}` `{"i":1,…}` — which is a fair reading of an
 * example array printed under the words "NOT wrapped in an array". Each row
 * validated as neither the full judgement nor the verdict prefix, so every
 * slot was dropped and the stream ended having produced nothing: a whole
 * streamed generation billed and thrown away on every graded answer, and no
 * early verdict, on the three phases that grade against a rubric. Rewording
 * the prompt did not move it — the model streams rows either way — so the
 * reader accepts rows.
 *
 * Stateful, so one per stream: rows accumulate by index and nothing is
 * returned until every rubric row has a ruling. Partial arrays never leave
 * here, which is what keeps `validateFeynmanVerdicts`'s coverage rule — no row
 * silently unjudged — true of the prefix as well as the full object.
 */
export function verdictPrefix(count: number) {
  const rows = new Map<number, FeynmanVerdictRow>();
  return (raw: unknown): { verdicts: FeynmanVerdictRow[] } => {
    try {
      return { verdicts: validateFeynmanVerdicts(raw, count) };
    } catch (whole) {
      // Not the array shape. A single row is the other thing it can be;
      // anything else is an object nobody asked for, and the caller's own
      // error is the more useful one to report for it.
      const row = obj(raw, "payload");
      const i = typeof row.i === "number" ? Math.trunc(row.i) : NaN;
      if (!Number.isFinite(i) || i < 0 || i >= count) throw whole;
      const quote = typeof row.quote === "string" ? row.quote.trim().slice(0, 200) : "";
      // First ruling per index wins, exactly as the array path dedups.
      if (!rows.has(i))
        rows.set(i, {
          i,
          verdict: oneOf(row.verdict, VERDICTS, "verdict"),
          ...(quote ? { quote } : null),
        });
      // Still a prefix of a prefix: drop the slot and wait for the rest. Its
      // own message, not the validator's — this is the ordinary path for every
      // row but the last, and re-throwing "verdicts must be an array" puts
      // `count - 1` lines that look like a broken judge on the error dashboard
      // each time one works. (It cost this investigation an afternoon.)
      if (rows.size < count)
        throw new Error(`verdict row ${i} buffered — ${rows.size} of ${count} so far`);
      return {
        verdicts: Array.from({ length: count }, (_, at) => rows.get(at)!),
      };
    }
  };
}

export {
  judgeSocratic,
  judgeSocraticStream,
  type SocraticJudgement,
} from "./judgeSocratic";

export interface FeynmanVerdictRow {
  /** Index into the rubric the judge was given. */
  i: number;
  verdict: "good" | "skipped" | "confused";
  /** The learner's own words that earned a gap — quoted back on the map. */
  quote?: string;
}

export interface FeynmanJudgement {
  verdicts: FeynmanVerdictRow[];
  response: string;
  /** Terms they used but never unpacked — the Feynman rule, checked. */
  jargon: string[];
}

interface JudgeFeynmanParams {
  topic: string;
  nodeLabel: string;
  /** The rubric rows, in order: what a complete explanation had to convey. */
  rubric: Array<{ subPoint: string; mustConvey: string[] }>;
  explanation: string;
  language?: Language;
}

function feynmanJudgeMessages(params: JudgeFeynmanParams): ChatMessage[] {
  const { topic, nodeLabel, rubric, explanation, language = "en" } = params;
  const rows = rubric
    .map((r, i) => `${i}. ${r.subPoint} — must convey: ${r.mustConvey.join("; ")}`)
    .join("\n");
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `The learner just taught the concept "${nodeLabel}" (topic: ${topic}) from a blank page to a naive student who has never heard of it. They were NOT shown the rubric below — what they never thought to mention is the finding.

Rubric — the sub-points a complete explanation covers:
${rows}

The learner's explanation, verbatim: """${explanation}"""

Diff the explanation against every rubric row, by index:
- "good": their own words genuinely convey the row (paraphrase, their own structure and examples are all fine — this is not a keyword match).
- "skipped": never addressed, or asserted with no explanation behind it. A row they simply never mentioned is "skipped".
- "confused": addressed, but with a real error or misconception in it.
On "skipped" and "confused", quote the learner's own words that earned it in \`quote\` — the exact fragment, under 20 words. For a row they never mentioned at all, leave \`quote\` empty.

Also apply the Feynman rule itself: list in \`jargon\` every technical term they leaned on without ever unpacking it in plain language (the term as they wrote it, at most 5). Fluent recitation of named terms is exactly the failure this phase exists to catch. Empty array if they explained everything they named.

Respond AS the naive student in \`response\`: 2-4 sentences, quoting or referencing their actual words — pleased where it landed, still-puzzled and naming precisely what was missing where it didn't. Never smooth over an error.

Return JSON: {"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one per rubric row], "response": "...", "jargon": ["..."]}${languageNote(language)}`,
    },
  ];
}

/** The verdict rows alone — the Gap Report's opener, and `recite.ts`'s too. */
export function validateFeynmanVerdicts(
  raw: unknown,
  count: number,
): FeynmanVerdictRow[] {
  const root = obj(raw, "payload");
  // The cap allows duplicates through: a repeated index is a real thing models
  // do, the dedup below is what handles it, and capping at `count` here would
  // reject the payload before that ever ran. Coverage is enforced after dedup.
  const rows = arr(root.verdicts, "verdicts", 1, Math.max(count, 1) * 2).map((r, j) => {
    const row = obj(r, `verdicts[${j}]`);
    const i = typeof row.i === "number" ? Math.trunc(row.i) : NaN;
    if (!Number.isFinite(i) || i < 0 || i >= count)
      fail(`verdicts[${j}].i must be a rubric index 0-${count - 1}`);
    const quote = typeof row.quote === "string" ? row.quote.trim().slice(0, 200) : "";
    return {
      i,
      verdict: oneOf(row.verdict, VERDICTS, `verdicts[${j}].verdict`),
      ...(quote ? { quote } : null),
    };
  });
  // One ruling per row: a repeated index is the model second-guessing itself,
  // and the first ruling is the one it committed to.
  const deduped = rows.filter((r, at) => rows.findIndex((o) => o.i === r.i) === at);
  // Every rubric row needs a ruling. A judge that returns only the rows it
  // found interesting leaves the rest with no verdict at all — and a row with
  // no verdict spawns no gap, so the learner is marked clean on material they
  // never explained. Failing here routes it through the corrective retry.
  if (deduped.length !== count) {
    const missing = Array.from({ length: count }, (_, i) => i).filter(
      (i) => !deduped.some((r) => r.i === i),
    );
    fail(
      `verdicts must contain exactly one ruling per rubric row (0-${count - 1}) — missing ${missing.join(", ")}`,
    );
  }
  return deduped;
}

/** Exported for tests: every rubric row must come back with a ruling, since a
 *  row with no verdict silently spawns no gap. */
export const validateFeynmanJudgement =
  (count: number) =>
  (raw: unknown): FeynmanJudgement => {
    const root = obj(raw, "payload");
    return {
      verdicts: validateFeynmanVerdicts(raw, count),
      response: str(root.response, "response"),
      jargon: Array.isArray(root.jargon)
        ? root.jargon
            .filter((t): t is string => typeof t === "string" && !!t.trim())
            .slice(0, 5)
            .map((t) => t.trim().slice(0, 60))
        : [],
    };
  };

export async function judgeFeynman(
  params: JudgeFeynmanParams,
): Promise<FeynmanJudgement> {
  return generateJson(
    feynmanJudgeMessages(params),
    validateFeynmanJudgement(params.rubric.length),
    {
      label: "judge-feynman",
      role: "judge",
    },
  );
}

export function judgeFeynmanStream(
  params: JudgeFeynmanParams,
): AsyncGenerator<StreamFrame> {
  const count = params.rubric.length;
  return judgeStream<FeynmanJudgement>(feynmanJudgeMessages(params), {
    firstShape: VERDICT_FIRST_SHAPE,
    first: verdictPrefix(count),
    full: validateFeynmanJudgement(count),
    label: "judge-feynman",
  });
}

export interface CrucibleJudgement {
  outcome: "pass" | "partial";
  transfer: Array<{ verdict: "good" | "red"; text: string }>;
  /** Present when outcome is "partial": the actually-missing sub-concept. */
  gapLabel?: string;
  gapReason?: string;
  reExplain?: string;
}

interface JudgeCrucibleParams {
  topic: string;
  nodeLabel: string;
  problem: string;
  hint: string;
  attempt: string;
  /** The learner opened the hint before answering. The Crucible is the only
   *  measurement of transfer in the app, and an unaided pass and a pass on a
   *  handed-over reframe are not the same reading — so the judge is told. */
  hinted?: boolean;
  language?: Language;
}

function crucibleJudgeMessages(params: JudgeCrucibleParams): ChatMessage[] {
  const { topic, nodeLabel, problem, hint, attempt, hinted, language = "en" } = params;
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `Concept under test: "${nodeLabel}" (topic: ${topic}).
Transfer problem posed: """${problem}"""
(The intended reframe: ${hint})
The learner's actual attempt: """${attempt}"""

${
  hinted
    ? 'The learner revealed the hint before answering, so the reframe was handed to them. Grade what is left: applying a reframe you were given is a lower bar than finding it, so "pass" needs the reasoning after the hint to be right AND complete. Say plainly in one transfer row how much of the work the hint did.\n'
    : ""
}Grade the attempt. "pass" ONLY if the core concept genuinely transferred — the reasoning is right where it matters (arithmetic slips that don't touch the concept may pass with a note). Anything empty, vague, off-topic, or containing a conceptual error is "partial". Never grade generously.

Return JSON:
{
  "outcome": "pass" | "partial",
  "transfer": [   // exactly 3 rows diagnosing THIS attempt — quote or reference what they actually wrote
    {"verdict": "good" | "red", "text": "which sub-concept transferred or broke, grounded in their words"}
  ],
  "gapLabel": "the missing sub-concept as a map label (3-7 words)",   // partial only
  "gapReason": "why it split out, phrased to the learner, quoting their error",   // partial only
  "reExplain": "a 30-second Socratic re-explanation aimed straight at that gap, ending with one question"   // partial only
}${languageNote(language)}`,
    },
  ];
}

const validateCrucibleJudgement = (raw: unknown): CrucibleJudgement => {
  const root = obj(raw, "payload");
  const outcome = oneOf(root.outcome, ["pass", "partial"] as const, "outcome");
  const transfer = arr(root.transfer, "transfer", 3, 3).map((v, i) => {
    const t = obj(v, `transfer[${i}]`);
    return {
      verdict: oneOf(t.verdict, ["good", "red"] as const, `transfer[${i}].verdict`),
      text: str(t.text, `transfer[${i}].text`),
    };
  });
  if (outcome === "partial" && !transfer.some((t) => t.verdict === "red"))
    fail('a "partial" outcome needs at least one red transfer row');
  const out: CrucibleJudgement = { outcome, transfer };
  if (outcome === "partial") {
    out.gapLabel = str(root.gapLabel, "gapLabel (required for partial)");
    out.gapReason = str(root.gapReason, "gapReason (required for partial)");
    out.reExplain = str(root.reExplain, "reExplain (required for partial)");
  }
  return out;
};

export async function judgeCrucible(
  params: JudgeCrucibleParams,
): Promise<CrucibleJudgement> {
  return generateJson(crucibleJudgeMessages(params), validateCrucibleJudgement, {
    label: "judge-crucible",
    role: "judge",
  });
}

/** The worst wait measured in the app (28 s on one attempt) — and the one
 *  whose verdict is a single word. `outcome` alone opens the result panel; the
 *  three diagnostic rows land into it. */
export function judgeCrucibleStream(
  params: JudgeCrucibleParams,
): AsyncGenerator<StreamFrame> {
  return judgeStream<CrucibleJudgement>(crucibleJudgeMessages(params), {
    firstShape: `{"outcome": "pass" | "partial"}`,
    first: (raw) => ({
      outcome: oneOf(
        obj(raw, "verdict").outcome,
        ["pass", "partial"] as const,
        "outcome",
      ),
    }),
    full: validateCrucibleJudgement,
    label: "judge-crucible",
  });
}
