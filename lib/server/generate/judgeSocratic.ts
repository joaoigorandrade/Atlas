// ---- kind: judge-socratic --------------------------------------------------
// The one judge that grades a *dialogue* rather than a finished artefact, and
// the only one whose verdict moves a ladder: the three rubric judges in
// `judge.ts` diff one submission against rows they were handed, while this one
// reads a conversation in progress and decides how much help the next turn
// gets. It also carries the coverage ledger, which is what lets a learner
// build one answer across two turns.
import { QUALITIES } from "./socratic";
import { obj, oneOf, str, languageNote } from "./common";
import { JUDGE_SYSTEM } from "./judge";
import { Language } from "@/lib/i18n";
import { ChatMessage, generateJson } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";
import { judgeStream } from "./judgeStream";

export interface SocraticJudgement {
  quality: "correct" | "partial" | "near" | "wrong" | "lost";
  response: string;
  /** Which `sufficient` pieces everything-said-so-far now covers, by index.
   *  The learner's ledger, and the reason answering across two turns reads as
   *  one complete answer rather than as a near miss repeated. */
  covered?: number[];
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
  0: `Scaffolding is at Silent: on a "near" or "wrong", name the error plainly and re-ask — no reframing hint. On a "partial", you may ONLY ask whether that is the whole answer ("Is that the whole story?"). At this rung you must NOT name, hint at, or gesture toward the piece that is still missing — naming it is what the next rung is for, and the learner is credited for this rung precisely because nothing was handed over.`,
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
  /** The rung this step is currently at (0-3, Silent → Show me). */
  help?: number;
  /** What this probe needs to hear, as separable pieces. Empty for passes
   *  written before the field existed — those fall back to `reference`. */
  sufficient?: string[];
  /** Everything the learner has already said on this step, oldest first. The
   *  verdict grades the union of these plus the new answer. */
  said?: string[];
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
    sufficient,
    said,
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
  // The bar is this probe's own, when the pass wrote one. Falling back to
  // `reference` — which is `tell`, a complete and precise exposition — is what
  // made a one-sentence reply to a probing question read as a near miss
  // almost every time.
  const bar = sufficient?.length
    ? `This probe is answered when the learner has conveyed ALL of these, in any words of their own:\n${sufficient
        .map((x, i) => `  [${i}] ${x}`)
        .join(
          "\n",
        )}\nNothing beyond this list is required. Do not hold out for the full exposition.`
    : `A fully correct answer would convey: "${reference}"`;
  const saidBlock =
    said && said.length
      ? `\nEverything the learner has already said on this step, oldest first:\n${said
          .map((x) => `  - """${x}"""`)
          .join(
            "\n",
          )}\nGrade the UNION of those and the new answer below. A point they made two turns ago still counts — they do not have to say it again.\n`
      : "";
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `Concept: "${nodeLabel}" (topic: ${topic}).
The tutor asked: "${question}"
${bar}
${saidBlock}
${historyBlock}${misconceptionBlock}${recurringBlock}This is attempt ${attempt ?? 1} on this step. Do not repeat a hint already given above — advance it.
${SOCRATIC_HELP_INSTRUCTION[help ?? 1]}
The learner answered: """${answer}"""

Classify the UNION of everything they have said, and respond contingently:
- "correct": the union now covers the whole bar (wording may differ) → affirm specifically, one sentence.
- "partial": everything they have said is RIGHT, and this answer added real new ground, but the union does not cover the whole bar yet. Nothing they said is wrong. → confirm what landed, then ask for the rest as the scaffolding rung above allows. This is NOT a failure and must not be worded as one. Use it whenever the learner is building the answer across turns — that is a normal way to think, not a defect.
- "near": right direction, but this answer added nothing new, or is too imprecise to count → give a hint that reframes WITHOUT giving the answer, then re-ask — a *different* angle than any hint already given.
- "wrong": contains a real error or misconception → name the error plainly and specifically, quoting their words; do not reveal the full answer.
- "lost": empty, "I don't know", or entirely off-track → do NOT hand over the whole answer: the step stays open and the learner still has to build it, so an answer given away here is one they would only type back. Give one concrete foothold — the first step of the reasoning, stated plainly — then ask a smaller, easier question that starts from it.

Return JSON: {"quality": "correct" | "partial" | "near" | "wrong" | "lost", "covered": [0, 1], "response": "the tutor's reply to the learner", "misconception": "on \"near\"/\"wrong\" only: the wrong idea itself in 3-8 words, phrased to still read out of context weeks later (e.g. \"treats scaling as rotation\") — omit otherwise"}
"covered" lists the indices of the bar above that the union now conveys${
        sufficient?.length ? "" : " (omit it — this probe has no indexed bar)"
      }. It only ever grows across a step. Credit a piece only when the learner's OWN words state it — never one that only the tutor's question, hint or reframe contained, and never one you are inferring they must have meant.${languageNote(language)}`,
    },
  ];
}

/** The bar indices the union conveys, read leniently: junk entries drop out. */
const coveredOf = (root: Record<string, unknown>): number[] =>
  Array.isArray(root.covered)
    ? [
        ...new Set(
          root.covered.filter(
            (n): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0,
          ),
        ),
      ].sort((a, b) => a - b)
    : [];

const validateSocraticJudgement = (raw: unknown): SocraticJudgement => {
  const root = obj(raw, "payload");
  // The tag is the only part of a caught wrong turn that outlives the session,
  // but it is still read leniently: a judgement without one still judges.
  const tag = typeof root.misconception === "string" ? root.misconception.trim() : "";
  const covered = coveredOf(root);
  return {
    quality: oneOf(root.quality, QUALITIES, "quality"),
    response: str(root.response, "response"),
    ...(covered.length ? { covered } : null),
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
    // `covered` rides with the verdict: the client applies this prefix and
    // never reads the ledger off the full object, and whether a "partial"
    // earned its keep is decided by what it banked.
    firstShape: `{"quality": "correct" | "partial" | "near" | "wrong" | "lost", "covered": [0, 1]}`,
    first: (raw) => {
      const root = obj(raw, "verdict");
      const covered = coveredOf(root);
      return {
        quality: oneOf(root.quality, QUALITIES, "quality"),
        ...(Array.isArray(root.covered) ? { covered } : null),
      };
    },
    full: validateSocraticJudgement,
    label: "judge-socratic",
  });
}
