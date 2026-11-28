// ---- the card grader --------------------------------------------------------
// A review card answered in the learner's own words is graded here, as a one-row
// rubric (the card's `back` is what must come back). Retrieval is the signal,
// not eloquence: a terse correct answer scores as well as a fluent one. The
// judge only *suggests* a grade; the learner confirms it.

import { languageNote } from "./common";
import {
  JUDGE_SYSTEM,
  judgeStream,
  learnerText,
  verdictPrefix,
  VERDICT_FIRST_SHAPE,
  validateFeynmanJudgement,
  type FeynmanJudgement,
} from "./judge";
import { Language } from "@/lib/i18n";
import { ChatMessage } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";
import { decideRubric } from "./jevJudge";
import { judgeOnce } from "./judgeStream";

export interface JudgeRecallParams {
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

What they wrote, verbatim:
${learnerText("answer", written)}

Rule every row, by index:
- "good": their own words genuinely deliver it. Their wording and order are their own — this is NOT a keyword match, and a spelling or accent difference in a name is not a miss.
- "skipped": it never came back at all — they simply did not retrieve it.
- "confused": it came back wrong — they retrieved something, and what they retrieved is incorrect.
On "skipped" and "confused", quote their own words that earned it in \`quote\` — the exact fragment, under 20 words. For a row they never touched, leave \`quote\` empty.

Return \`jargon\` as an empty array. Unpacked terminology is Feynman's finding, not this one: here a technical term used correctly IS successful retrieval.

In \`response\`, 2-4 sentences to the learner, quoting their actual words. Retrieval is the signal, not eloquence: a terse correct answer is a good one, and a fluent answer missing a row is still missing it. Name what came back and what did not.

Return JSON: {"verdicts": [{"i": 0, "quote": "...", "verdict": "good" | "skipped" | "confused"}, ...one per rubric row], "response": "...", "jargon": []}${languageNote(language)}`,
    },
  ];
}

export async function judgeRecall(params: JudgeRecallParams): Promise<FeynmanJudgement> {
  return judgeOnce(
    recallJudgeMessages(params),
    validateFeynmanJudgement(params.rubric.length),
    "judge-recall",
    decideRubric("recall", { ...params, text: params.written }),
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
    decided: decideRubric("recall", { ...params, text: params.written }),
  });
}
