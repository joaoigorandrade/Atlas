// ---- judge mode: choice ----------------------------------------------------
// The open-ended half of every surface that also has a closed form (placement,
// the Consume hook, the Feynman fix pass). The learner writes in their own
// words; the judge maps that onto the option index the existing closed-path
// logic already keys on, so nothing downstream changes.
import { JUDGE_SYSTEM, judgeStream } from "./judge";

import { fail, languageNote, obj, str } from "./common";
import { Language } from "@/lib/i18n";
import { ChatMessage, generateJson } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

export interface ChoiceJudgement {
  index: number;
  response: string;
}

/** Split out for tests: the index must land inside the option list. */
export function validateChoice(count: number) {
  return (raw: unknown): ChoiceJudgement => {
    const root = obj(raw, "payload");
    const index = typeof root.index === "number" ? root.index : NaN;
    if (!Number.isInteger(index) || index < 0 || index >= count)
      fail(`index must be an integer 0-${count - 1} (got ${JSON.stringify(root.index)})`);
    return { index, response: str(root.response, "response") };
  };
}

interface JudgeChoiceParams {
  topic: string;
  nodeLabel?: string;
  question: string;
  options: string[];
  answer: string;
  language?: Language;
}

function choiceJudgeMessages(params: JudgeChoiceParams): ChatMessage[] {
  const { topic, nodeLabel, question, options, answer, language = "en" } = params;
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `Topic: ${topic}${nodeLabel ? ` · concept: "${nodeLabel}"` : ""}.
The learner was asked: "${question}"
They answered in their own words: """${answer}"""

Map their answer onto the closest of these candidate answers:
${options.map((o, i) => `${i}. ${o}`).join("\n")}

Pick the candidate that matches what they ACTUALLY said, not what they should have said. Empty, vague, evasive or off-topic answers map to the weakest / least-correct candidate — never a generous one.

Return JSON: {"index": <number>, "response": "one sentence to the learner naming what their answer showed, quoting their words"}${languageNote(language)}`,
    },
  ];
}

export async function judgeChoice(params: JudgeChoiceParams): Promise<ChoiceJudgement> {
  return generateJson(
    choiceJudgeMessages(params),
    validateChoice(params.options.length),
    {
      label: "judge-choice",
      role: "judge",
    },
  );
}

export function judgeChoiceStream(
  params: JudgeChoiceParams,
): AsyncGenerator<StreamFrame> {
  const count = params.options.length;
  return judgeStream<ChoiceJudgement>(choiceJudgeMessages(params), {
    firstShape: `{"index": <number>}`,
    // Not `validateChoice` with a blank response — that validator (rightly)
    // rejects an empty `response`, so the verdict-only object would fail.
    first: (raw) => {
      const index = obj(raw, "verdict").index;
      if (
        typeof index !== "number" ||
        !Number.isInteger(index) ||
        index < 0 ||
        index >= count
      )
        fail(`index must be an integer 0-${count - 1}`);
      return { index: index as number };
    },
    full: validateChoice(count),
    label: "judge-choice",
  });
}
