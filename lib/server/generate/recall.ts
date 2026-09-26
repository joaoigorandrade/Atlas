// ---- kind: recall ----------------------------------------------------------
// The blank page, and the rubric it is graded against. The learner never sees
// the rubric before they write: what they never think to mention is the whole
// finding here.
//
// Graded by its own judge below rather than by Feynman's. The verdict *rows*
// are the same shape — a rubric diff is a rubric diff, and one report renderer
// is better than two — but the instruction is not: retrieval is not eloquence,
// so a terse correct answer must score as well as a fluent one, and the
// unpacked-jargon check that makes Feynman work would punish exactly the
// learner Recall is trying to reward.

import {
  type Boundary,
  arr,
  boundaryNote,
  interestNote,
  domainNote,
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
  verdictPrefix,
  VERDICT_FIRST_SHAPE,
  validateFeynmanJudgement,
  type FeynmanJudgement,
} from "./judge";
import type { Domain, NodeKind, RecallContent } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { ChatMessage, generateJson } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

/** How many rows a cold retrieval is asked for. Narrower than Feynman's
 *  rubric: this is one retrieval, not a whole explanation. */
export const RECALL_ROW_BOUNDS = { min: 3, max: 5 } as const;

export function validateRecall(nodeId: string, nodeLabel: string) {
  return (raw: unknown): RecallContent => {
    const root = obj(raw, "payload");
    const rubric = arr(
      root.rubric,
      "rubric",
      RECALL_ROW_BOUNDS.min,
      RECALL_ROW_BOUNDS.max,
    ).map((v, i) => {
      const r = obj(v, `rubric[${i}]`);
      return {
        id: `rc-${nodeId}-${i + 1}`,
        point: str(r.point, `rubric[${i}].point`),
        mustRetrieve: arr(r.mustRetrieve, `rubric[${i}].mustRetrieve`, 1, 3).map((m, j) =>
          rejectEcho(
            str(m, `rubric[${i}].mustRetrieve[${j}]`),
            `rubric[${i}].mustRetrieve[${j}]`,
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

export interface RecallParams extends Boundary {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  nodeKind?: NodeKind;
  domain?: Domain;
}

export async function generateRecall(params: RecallParams): Promise<RecallContent> {
  const { topic, nodeLabel, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write an UNAIDED RETRIEVAL pass for the concept "${nodeLabel}" within "${topic}": the learner has nothing in front of them and writes down everything they can still produce about it.
${interestNote(interests)}
${boundaryNote(params)}${kindNote(params.nodeKind, "recall")}${domainNote(params.domain, "recall")}

The learner NEVER sees the rubric before answering — they work from the brief alone. So a row is a thing a cold retrieval has to BRING BACK, not a thing to explain: a definition, a value, a condition, a consequence.

Return JSON:
{
  "brief": "the one line on the blank page telling them what to write down from memory — no hints, no structure, no list of what to cover",
  "scaffold": "one sentence offered ONLY if they freeze — the smallest true starting point, never a piece of the answer",
  "rubric": [
    { "point": "one thing a cold retrieval must bring back (3-6 words)",
      "mustRetrieve": ["1-3 specific, checkable things their own words have to get across for this row to count — concrete, never 'covers it well'"] },
    ...
  ]   // ${RECALL_ROW_BOUNDS.min}-${RECALL_ROW_BOUNDS.max} rows, as many as the concept genuinely owes
}${languageNote(language)}`,
    ),
    validateRecall(params.nodeId, nodeLabel),
    { label: "recall" },
  );
}

// ---- the grader ------------------------------------------------------------

interface JudgeRecallParams {
  topic: string;
  nodeLabel: string;
  /** The brief they actually worked from. */
  brief: string;
  rubric: Array<{ subPoint: string; mustConvey: string[] }>;
  /** True when they took the scaffold — a cued retrieval, and the reaction
   *  should say so rather than congratulate an unaided one. */
  cued?: boolean;
  written: string;
  language?: Language;
}

function recallJudgeMessages(params: JudgeRecallParams): ChatMessage[] {
  const { topic, nodeLabel, brief, rubric, written, cued, language = "en" } = params;
  const rows = rubric
    .map((r, i) => `${i}. ${r.subPoint} — must bring back: ${r.mustConvey.join("; ")}`)
    .join("\n");
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `The learner just wrote down, from memory and with nothing in front of them, everything they could still produce about "${nodeLabel}" (topic: ${topic}).

They were asked: """${brief}"""
They were NOT shown the rubric below.${cued ? "\nThey took a one-sentence cue before writing, so this is a CUED retrieval — say so plainly in your reaction rather than treating it as unaided." : ""}

Rubric — what a complete retrieval brings back:
${rows}

What they wrote, verbatim: """${written}"""

Rule every row, by index:
- "good": their own words genuinely deliver it. Their wording and order are their own — this is NOT a keyword match, and a spelling or accent difference in a name is not a miss.
- "skipped": it never came back at all — they simply did not retrieve it.
- "confused": it came back wrong — they retrieved something, and what they retrieved is incorrect.
On "skipped" and "confused", quote their own words that earned it in \`quote\` — the exact fragment, under 20 words. For a row they never touched, leave \`quote\` empty.

Return \`jargon\` as an empty array. Unpacked terminology is Feynman's finding, not this one: here a technical term used correctly IS successful retrieval.

In \`response\`, 2-4 sentences to the learner, quoting their actual words. Retrieval is the signal, not eloquence: a terse correct answer is a good one, and a fluent answer missing a row is still missing it. Name what came back and what did not.

Return JSON: {"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one per rubric row], "response": "...", "jargon": []}${languageNote(language)}`,
    },
  ];
}

export async function judgeRecall(params: JudgeRecallParams): Promise<FeynmanJudgement> {
  return generateJson(
    recallJudgeMessages(params),
    validateFeynmanJudgement(params.rubric.length),
    { label: "judge-recall", role: "judge" },
  );
}

export function judgeRecallStream(
  params: JudgeRecallParams,
): AsyncGenerator<StreamFrame> {
  const count = params.rubric.length;
  return judgeStream<FeynmanJudgement>(recallJudgeMessages(params), {
    firstShape: VERDICT_FIRST_SHAPE,
    first: verdictPrefix(count),
    full: validateFeynmanJudgement(count),
    label: "judge-recall",
  });
}
