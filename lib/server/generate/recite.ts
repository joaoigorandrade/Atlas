// ---- kinds: recall · perform ----------------------------------------------
// Both phases are a blank page graded against a rubric, so they share a
// generator and differ where the difference belongs: the brief the learner
// reads, and what the rubric rows are rows *of*.
//
//   recall   unaided retrieval — what comes back with nothing in front of you
//   perform  execution under real conditions — the procedure actually run
//
// The rubric is never shown before the answer. That is the whole diagnostic:
// what a learner never thinks to write is the finding, and a rubric printed
// above the box is the answer handed over before the test.

import {
  arr,
  boundaryNote,
  interestNote,
  kindNote,
  languageNote,
  obj,
  rejectEcho,
  str,
  user,
} from "./common";
import {
  JUDGE_SYSTEM,
  judgeStream,
  validateFeynmanJudgement,
  validateFeynmanVerdicts,
  type FeynmanJudgement,
} from "./judge";
import type { ReciteContent, RecitePhase, NodeKind } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { ChatMessage, generateJson } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

/** How many rubric rows a recite pass asks for. Deliberately narrower than
 *  Feynman's: this is one retrieval or one run, not a whole explanation. */
export const RECITE_ROW_BOUNDS = { min: 3, max: 5 } as const;

/** Per-phase framing — what is being asked for, and what a row is a row of. */
const BRIEFS: Record<RecitePhase, { ask: string; row: string; brief: string }> = {
  recall: {
    ask: "an UNAIDED RETRIEVAL pass: the learner has nothing in front of them and writes down everything they can still produce about the concept",
    row: "one thing a cold retrieval of this concept has to bring back — a definition, a value, a condition, a consequence. Not a thing to explain: a thing to *have*",
    brief:
      "the one line on the blank page telling the learner what to write down from memory — no hints, no structure, no list of what to cover",
  },
  perform: {
    ask: "an EXECUTION pass: the learner is given one real case and carries the procedure out on it end to end, showing their work the way they would for real",
    row: "one thing a correct run of this procedure ON THE GIVEN CASE has to show — a step actually carried out, an intermediate result, a check applied. Not 'understands step 2': what step 2 produces here",
    brief:
      "the one line naming the concrete case to run the procedure on — a specific, self-contained case with real values or a real situation, stated in a sentence or two. Never say which steps to use",
  },
};

export function validateRecite(phase: RecitePhase, nodeId: string, nodeLabel: string) {
  return (raw: unknown): ReciteContent => {
    const root = obj(raw, "payload");
    const rubric = arr(
      root.rubric,
      "rubric",
      RECITE_ROW_BOUNDS.min,
      RECITE_ROW_BOUNDS.max,
    ).map((v, i) => {
      const r = obj(v, `rubric[${i}]`);
      return {
        id: `rc-${phase}-${nodeId}-${i + 1}`,
        point: str(r.point, `rubric[${i}].point`),
        mustConvey: arr(r.mustConvey, `rubric[${i}].mustConvey`, 1, 3).map((m, j) =>
          rejectEcho(
            str(m, `rubric[${i}].mustConvey[${j}]`),
            `rubric[${i}].mustConvey[${j}]`,
          ),
        ),
      };
    });
    return {
      nodeId,
      nodeLabel,
      brief: str(root.brief, "brief"),
      scaffold: str(root.scaffold, "scaffold"),
      rubric,
    };
  };
}

export interface ReciteParams {
  phase: RecitePhase;
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  nodeKind?: NodeKind;
  priorLabels?: string[];
  laterLabels?: string[];
}

export async function generateRecite(params: ReciteParams): Promise<ReciteContent> {
  const { phase, topic, nodeLabel, interests, language = "en" } = params;
  const f = BRIEFS[phase];
  return generateJson(
    user(
      `Write ${f.ask}, for the concept "${nodeLabel}" within "${topic}".
${interestNote(interests)}
${boundaryNote(params)}${kindNote(params.nodeKind, phase)}

The learner NEVER sees the rubric before they answer — they work from the brief alone and their answer is diffed against these rows afterwards. So a row is what a complete answer contains, not a question and not a hint.

Return JSON:
{
  "brief": "${f.brief}",
  "scaffold": "one sentence offered ONLY if they freeze — the smallest true starting point, never a piece of the answer",
  "rubric": [
    { "point": "${f.row} (3-6 words)",
      "mustConvey": ["1-3 specific, checkable things the learner's own words have to get across for this row to count — concrete, never 'covers it well'"] },
    ...
  ]   // ${RECITE_ROW_BOUNDS.min}-${RECITE_ROW_BOUNDS.max} rows, as many as the concept genuinely owes
}${languageNote(language)}`,
    ),
    validateRecite(phase, params.nodeId, nodeLabel),
    { label: `recite-${phase}` },
  );
}

// ---- judge mode: recite (Recall · Perform) --------------------------------
// Same diff, same shape, a different thing being diffed. Recall grades what
// came back unaided; Perform grades a procedure actually run on a case. Both
// reuse the Feynman verdict rows — one ruling per rubric row, quoting the
// learner — because a rubric diff is a rubric diff, and a second shape here
// would mean a second report renderer for no gain.
//
// `jargon` comes back empty for both: the unpacked-term check is Feynman's
// signal (unaided *production* in plain language), not retrieval's or
// execution's. The field stays in the shape so the validator is shared.

interface JudgeReciteParams {
  /** Which phase is being graded — it changes what a miss means. */
  frame: RecitePhase;
  topic: string;
  nodeLabel: string;
  /** The brief the learner actually worked from. */
  brief: string;
  rubric: Array<{ subPoint: string; mustConvey: string[] }>;
  explanation: string;
  language?: Language;
}

const RECITE_FRAME: Record<
  RecitePhase,
  { did: string; skipped: string; confused: string; voice: string }
> = {
  recall: {
    did: "wrote down, from memory and with nothing in front of them, everything they could still produce about",
    skipped: "never came back to them at all — they simply did not retrieve it",
    confused:
      "came back wrong: they retrieved something, and what they retrieved is incorrect",
    voice:
      "Speak plainly about what was retrieved and what was not. Retrieval is the signal here, not eloquence: a terse, correct answer is a good one, and a fluent answer missing a row is still missing it.",
  },
  perform: {
    did: "carried the procedure out, end to end, on the concrete case they were given for",
    skipped: "was never carried out — the step is missing from the run",
    confused: "was carried out incorrectly: the step ran, and its result is wrong",
    voice:
      "Speak as someone checking the work. Say where the run holds and where it breaks, naming the step and what it produced. A correct method with one wrong intermediate result is still a failed run of that step, and nothing else.",
  },
};

function reciteJudgeMessages(params: JudgeReciteParams): ChatMessage[] {
  const { frame, topic, nodeLabel, brief, rubric, explanation, language = "en" } = params;
  const f = RECITE_FRAME[frame];
  const rows = rubric
    .map((r, i) => `${i}. ${r.subPoint} — must convey: ${r.mustConvey.join("; ")}`)
    .join("\n");
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `The learner just ${f.did} the concept "${nodeLabel}" (topic: ${topic}).

They were asked: """${brief}"""
They were NOT shown the rubric below.

Rubric — what a complete answer contains:
${rows}

The learner's answer, verbatim: """${explanation}"""

Rule every rubric row, by index:
- "good": their own words genuinely deliver the row. Their wording, order and examples are their own — this is not a keyword match.
- "skipped": it ${f.skipped}.
- "confused": it ${f.confused}.
On "skipped" and "confused", quote the learner's own words that earned it in \`quote\` — the exact fragment, under 20 words. For a row they never touched at all, leave \`quote\` empty.

Return \`jargon\` as an empty array.

In \`response\`, 2-4 sentences to the learner, quoting or referencing their actual words. ${f.voice} Never smooth over a miss.

Return JSON: {"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one per rubric row], "response": "...", "jargon": []}${languageNote(language)}`,
    },
  ];
}

export async function judgeRecite(params: JudgeReciteParams): Promise<FeynmanJudgement> {
  return generateJson(
    reciteJudgeMessages(params),
    validateFeynmanJudgement(params.rubric.length),
    { label: `judge-recite-${params.frame}`, role: "judge" },
  );
}

export function judgeReciteStream(
  params: JudgeReciteParams,
): AsyncGenerator<StreamFrame> {
  const count = params.rubric.length;
  return judgeStream<FeynmanJudgement>(reciteJudgeMessages(params), {
    firstShape: `{"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one per rubric row]}`,
    first: (raw) => ({ verdicts: validateFeynmanVerdicts(raw, count) }),
    full: validateFeynmanJudgement(count),
    label: `judge-recite-${params.frame}`,
  });
}
