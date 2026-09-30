// ---- judge mode: connect -----------------------------------------------------
// A Connect link, in the learner's own words, checked before it is confirmed
// (W1.5). These sentences become review cards, and a wrong link rehearsed for
// months is the worst outcome the app can produce — so a `false` link is not
// confirmed, and a `vague` one is confirmed with a line saying what it lacks.
import { JUDGE_SYSTEM, judgeStream } from "./judge";
import { fail, languageNote, obj, str } from "./common";
import { Language } from "@/lib/i18n";
import { ChatMessage, generateJson } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

export const CONNECT_VERDICTS = ["true", "vague", "false"] as const;
export type ConnectVerdict = (typeof CONNECT_VERDICTS)[number];

export interface ConnectJudgement {
  verdict: ConnectVerdict;
  response: string;
}

const verdictOf = (raw: unknown): ConnectVerdict => {
  const v = obj(raw, "payload").verdict;
  if (!CONNECT_VERDICTS.includes(v as ConnectVerdict))
    fail(`verdict must be one of ${CONNECT_VERDICTS.join(", ")}`);
  return v as ConnectVerdict;
};

export const validateConnectJudgement = (raw: unknown): ConnectJudgement => ({
  verdict: verdictOf(raw),
  response: str(obj(raw, "payload").response, "response"),
});

interface JudgeConnectParams {
  topic: string;
  nodeLabel: string;
  /** The concept on the other end of the link. */
  question: string;
  /** The map's own statement of the relationship — a reference, not a key. */
  reference: string;
  answer: string;
  language?: Language;
}

function messages(p: JudgeConnectParams): ChatMessage[] {
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `Topic: ${p.topic}. The learner is linking "${p.nodeLabel}" to "${p.question}", in their own words:
"""${p.answer}"""
One accurate statement of how the two relate (a reference — the learner may state a DIFFERENT true relationship): "${p.reference}"

Rule the link:
- "true": it states a real, specific relationship between the two, correctly.
- "vague": nothing in it is wrong, but it says little more than that the two are related ("they are connected", "both are about X").
- "false": it asserts something wrong about either concept or about how they relate.
A different relationship from the reference is fine if it is true. Be strict: this sentence becomes a review card the learner will rehearse for months.

Return JSON: {"verdict": "true|vague|false", "response": "one sentence to the learner — what is right, or exactly what is wrong or missing"}${languageNote(p.language ?? "en")}`,
    },
  ];
}

export async function judgeConnect(p: JudgeConnectParams): Promise<ConnectJudgement> {
  return generateJson(messages(p), validateConnectJudgement, {
    label: "judge-connect",
    role: "judge",
  });
}

export function judgeConnectStream(p: JudgeConnectParams): AsyncGenerator<StreamFrame> {
  return judgeStream<ConnectJudgement>(messages(p), {
    firstShape: `{"verdict": "true|vague|false"}`,
    first: (raw) => ({ verdict: verdictOf(raw) }),
    full: validateConnectJudgement,
    label: "judge-connect",
  });
}
