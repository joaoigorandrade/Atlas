// ---- kind: judge -----------------------------------------------------------
// The live judging loop (#25-#27): the learner's own words, classified by a
// (configurably stronger) judge model. Anti-sycophancy is enforced in the
// prompt: wrong reasoning is named plainly, never affirmed.
import { VERDICTS } from "./feynman";
import { QUALITIES } from "./socratic";

import { arr, fail, languageNote, obj, oneOf, str } from "./common";
import { Language } from "@/lib/i18n";
import {
  ChatMessage,
  generateJson,
  streamJsonObjectsProgressive,
} from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

export const JUDGE_SYSTEM: ChatMessage = {
  role: "system",
  content:
    "You judge a learner's answer in a mastery-learning app. You are rigorous and anti-sycophantic: " +
    "a wrong answer is named plainly and specifically (quote the wrong part), never affirmed or smoothed over. " +
    "A near-miss earns a hint, never the full answer. Empty, evasive, or off-topic input is never treated as correct. " +
    "Reply with ONLY one valid JSON object.",
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
export async function* judgeStream<T extends object>(
  messages: ChatMessage[],
  spec: {
    /** What object 1 must contain — the smallest thing that unblocks the UI. */
    firstShape: string;
    first: (raw: unknown) => Partial<T>;
    full: (raw: unknown) => T;
    label: string;
  },
): AsyncGenerator<StreamFrame> {
  const last = messages.length - 1;
  const streamed: ChatMessage[] = messages.map((m, i) =>
    i === last
      ? {
          ...m,
          content: `${m.content}

Write TWO SEPARATE top-level JSON objects, one after another — NOT wrapped in
an array, no markdown fences, nothing before/after/between them.

First, immediately, the verdict alone: ${spec.firstShape}
Then the full object described above (it repeats the verdict and adds the rest).`,
        }
      : m,
  );

  // Each object is tried as the *complete* judgement first, and only then as
  // the verdict prefix. That ordering is what makes a model that ignores the
  // two-object instruction — and writes the whole thing at once — cost one
  // call rather than two: its single object validates as full, and the
  // fallback below never runs.
  let complete = false;
  let sent = 0;
  try {
    for await (const item of streamJsonObjectsProgressive<Partial<T> | T>(
      streamed,
      (raw) => {
        try {
          const value = spec.full(raw);
          complete = true;
          return value;
        } catch {
          return spec.first(raw);
        }
      },
      // The critique is the long half of a judgement and the learner is
      // watching an open bubble for it, so it goes out as it is written. Only
      // `response` is drafted: a partial verdict would be a *different*
      // classification than the one the model settles on, and that one drives
      // mastery writes.
      {
        label: `${spec.label}-stream`,
        role: "judge",
        partial: (raw) => {
          const response = (raw as { response?: unknown })?.response;
          return typeof response === "string" && response.trim()
            ? ({ response } as unknown as Partial<T>)
            : null;
        },
      },
    )) {
      if (item.partial) {
        yield { p: "judgement", v: item.value, partial: true };
        continue;
      }
      sent++;
      yield { p: "judgement", v: item.value };
      if (complete) return;
    }
  } catch (err) {
    console.error(
      JSON.stringify({
        evt: "judge_stream_fallback",
        label: spec.label,
        sent,
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      }),
    );
  }
  // Nothing streamed, or only the verdict did: the full judgement still owes
  // the learner a critique, so it comes off the proven retried path. A later
  // frame for the same slot replaces the earlier one, here and in the client.
  yield {
    p: "judgement",
    v: await generateJson(messages, spec.full, {
      label: spec.label,
      role: "judge",
    }),
  };
}

export interface SocraticJudgement {
  quality: "correct" | "near" | "wrong" | "lost";
  response: string;
  /** The wrong idea, tagged for the run-wide roll-up — present on a caught
   *  "near"/"wrong", absent otherwise. */
  misconception?: string;
}

interface JudgeSocraticTurn {
  role: "ai" | "learner";
  text: string;
}

interface JudgeSocraticMisconception {
  label: string;
  quality: string;
}

/** Silent → name it and move on; Show me → drop the act. The learner sets this
 *  by hand or lets it fade with mastery — either way the judge follows it. */
const SOCRATIC_HELP_INSTRUCTION: Record<number, string> = {
  0: `Scaffolding is set to Silent: on a "near" or "wrong", name the error plainly and re-ask — no reframing hint.`,
  1: `Scaffolding is set to Hint: on a "near" or "wrong", give exactly one reframing hint, then re-ask.`,
  2: `Scaffolding is set to Guide: on a "near" or "wrong", walk through one step of the reasoning aloud with them, then re-ask.`,
  3: `Scaffolding is set to Show me: on a "near" or "wrong", teach the relevant piece directly and completely rather than re-asking.`,
};

interface JudgeSocraticParams {
  topic: string;
  nodeLabel: string;
  question: string;
  reference: string;
  answer: string;
  /** Recent transcript for this step, oldest first — so a repeated hint or a
   *  misgraded reframe doesn't happen twice (#A). */
  history?: JudgeSocraticTurn[];
  /** Which attempt this is on the current step — 1 on the first try. */
  attempt?: number;
  /** The anticipated wrong/near replies authored with this step — a bank of
   *  misconceptions to catch by name instead of generically. */
  misconceptions?: JudgeSocraticMisconception[];
  /** What this learner keeps getting wrong across nodes and sessions — the one
   *  thing a tutor can only know from having been there before. */
  recurring?: string[];
  /** The scaffolding dial (0-3, Silent → Show me). Defaults to Hint. */
  help?: number;
  language?: Language;
}

function socraticJudgeMessages(params: JudgeSocraticParams): ChatMessage[] {
  const {
    topic,
    nodeLabel,
    question,
    reference,
    answer,
    history,
    attempt,
    misconceptions,
    recurring,
    help,
    language = "en",
  } = params;
  const historyBlock =
    history && history.length
      ? `\nThe conversation on this step so far:\n${history
          .map((t) => `${t.role === "ai" ? "Tutor" : "Learner"}: ${t.text}`)
          .join("\n")}\n`
      : "";
  const misconceptionBlock =
    misconceptions && misconceptions.length
      ? `\nMisconceptions anticipated for this step: ${misconceptions
          .map((m) => `"${m.label}" (${m.quality})`)
          .join("; ")}. If the learner's answer matches one, catch it by name.\n`
      : "";
  const recurringBlock =
    recurring && recurring.length
      ? `\nAcross earlier sessions this learner keeps hitting: ${recurring.join(
          "; ",
        )}. If this answer is another instance of one of those, say so — name the pattern ("this is the same swap you made on X") instead of catching it cold again, and return that misconception's label back VERBATIM in the "misconception" field so it counts as the same pattern rather than a new one. If it isn't, don't mention them at all.\n`
      : "";
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `Concept: "${nodeLabel}" (topic: ${topic}).
The tutor asked: "${question}"
A fully correct answer would convey: "${reference}"
${historyBlock}${misconceptionBlock}${recurringBlock}This is attempt ${attempt ?? 1} on this step. Do not repeat a hint already given above — advance it.
${SOCRATIC_HELP_INSTRUCTION[help ?? 1]}
The learner answered: """${answer}"""

Classify and respond contingently:
- "correct": the substance is right (wording may differ) → affirm specifically, one sentence.
- "near": right direction, one piece missing/imprecise → give a hint that reframes WITHOUT giving the answer, then re-ask — a *different* angle than any hint already given.
- "wrong": contains a real error or misconception → name the error plainly and specifically, quoting their words; do not reveal the full answer.
- "lost": empty, "I don't know", or entirely off-track → drop the Socratic act and teach the answer directly and completely.

Return JSON: {"quality": "correct" | "near" | "wrong" | "lost", "response": "the tutor's reply to the learner", "misconception": "on \"near\"/\"wrong\" only: the wrong idea itself in 3-8 words, phrased to still read out of context weeks later (e.g. \"treats scaling as rotation\") — omit otherwise"}${languageNote(language)}`,
    },
  ];
}

const validateSocraticJudgement = (raw: unknown): SocraticJudgement => {
  const root = obj(raw, "payload");
  // The tag is the only part of a caught wrong turn that outlives the session,
  // but it is still read leniently: a judgement without one still judges.
  const tag = typeof root.misconception === "string" ? root.misconception.trim() : "";
  return {
    quality: oneOf(root.quality, QUALITIES, "quality"),
    response: str(root.response, "response"),
    ...(tag ? { misconception: tag.slice(0, 120) } : null),
  };
};

export async function judgeSocratic(
  params: JudgeSocraticParams,
): Promise<SocraticJudgement> {
  return generateJson(socraticJudgeMessages(params), validateSocraticJudgement, {
    label: "judge-socratic",
    role: "judge",
  });
}

export function judgeSocraticStream(
  params: JudgeSocraticParams,
): AsyncGenerator<StreamFrame> {
  return judgeStream<SocraticJudgement>(socraticJudgeMessages(params), {
    firstShape: `{"quality": "correct" | "near" | "wrong" | "lost"}`,
    first: (raw) => ({
      quality: oneOf(obj(raw, "verdict").quality, QUALITIES, "quality"),
    }),
    full: validateSocraticJudgement,
    label: "judge-socratic",
  });
}

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

/** The verdict rows alone — the smallest thing that opens the Gap Report. */
function validateFeynmanVerdicts(raw: unknown, count: number): FeynmanVerdictRow[] {
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
    firstShape: `{"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one per rubric row]}`,
    first: (raw) => ({ verdicts: validateFeynmanVerdicts(raw, count) }),
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
  language?: Language;
}

function crucibleJudgeMessages(params: JudgeCrucibleParams): ChatMessage[] {
  const { topic, nodeLabel, problem, hint, attempt, language = "en" } = params;
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `Concept under test: "${nodeLabel}" (topic: ${topic}).
Transfer problem posed: """${problem}"""
(The intended reframe: ${hint})
The learner's actual attempt: """${attempt}"""

Grade the attempt. "pass" ONLY if the core concept genuinely transferred — the reasoning is right where it matters (arithmetic slips that don't touch the concept may pass with a note). Anything empty, vague, off-topic, or containing a conceptual error is "partial". Never grade generously.

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
