// What Atlas asks Jev (`lib/server/decide.ts`) about a learner's answer, one
// builder per judge. Each returns a `Decided` (`./judgeStream`) only for what
// Jev is sure of — the LLM is told that ruling and it is pinned over every
// frame — and null otherwise, which leaves the judge exactly as it was.

import { choice, decide, sureChoice } from "../decide";
import type { ChoiceJudgement } from "./choice";
import type { FeynmanJudgement } from "./judge";
import type { Decided } from "./judgeStream";

const NONE =
  "None of the candidates: the answer is empty, vague, evasive, off-topic, or says something none of them says.";

// ---- 1. judge mode "choice" -------------------------------------------------

export async function decideChoice(p: {
  topic: string;
  nodeLabel?: string;
  question: string;
  options: string[];
  answer: string;
}): Promise<Decided<ChoiceJudgement> | null> {
  const a = await decide(
    {
      topic: p.topic,
      concept: p.nodeLabel,
      question: p.question,
      learner_answer: p.answer,
    },
    {
      index: choice(
        "Which candidate does the learner's answer actually express — what they SAID, not what they should have said? Match on meaning, not wording: the same quantity in another unit or notation is the same answer; a candidate that only shares their words while meaning something else is not, and neither is one whose part the question explicitly asks for (a condition, a unit, a second quantity) the answer leaves out.",
        {
          ...Object.fromEntries(p.options.map((o, i) => [String(i), o])),
          none: NONE,
        },
      ),
    },
    "judge-choice",
  );
  const pick = sureChoice(a?.index);
  if (pick === undefined || pick === "none") return null;
  const index = Number(pick);
  return {
    verdict: { index },
    tell: `"index" is ${index} (candidate: "${p.options[index]}").`,
    early: true,
  };
}

// ---- 2. rubric judge (a review card answered in own words) ---------------------------------

type Row = FeynmanJudgement["verdicts"][number];

/** Per row: Jev's ruling replaces the LLM's; the LLM's quote survives only on
 *  a gap, since a quote is evidence for a gap. */
const pinRows = (llm: Partial<FeynmanJudgement>, v: Partial<FeynmanJudgement>) =>
  llm.verdicts
    ? {
        ...llm,
        verdicts: llm.verdicts.map((r): Row => {
          const fixed = v.verdicts?.find((x) => x.i === r.i);
          if (!fixed || fixed.verdict === r.verdict) return r;
          return {
            i: r.i,
            verdict: fixed.verdict,
            ...(fixed.verdict !== "good" && r.quote ? { quote: r.quote } : null),
          };
        }),
      }
    : llm;

const RUBRIC_WORDING = {
  recall: {
    ask: (row: string, must: string) =>
      `Did the learner's from-memory write-up bring back this rubric row? Row: ${row}. It must bring back: ${must}. A spelling or accent difference in a name is not a miss.`,
    good: "Their own words deliver it.",
    skipped: "It never came back at all.",
    confused: "It came back wrong: what they retrieved is incorrect.",
  },
};

export async function decideRubric(
  mode: keyof typeof RUBRIC_WORDING,
  p: {
    topic: string;
    nodeLabel: string;
    rubric: Array<{ subPoint: string; mustConvey: string[] }>;
    text: string;
  },
): Promise<Decided<FeynmanJudgement> | null> {
  const w = RUBRIC_WORDING[mode];
  const a = await decide(
    { topic: p.topic, concept: p.nodeLabel, learner_text: p.text },
    Object.fromEntries(
      p.rubric.map((r, i) => [
        `row_${i}`,
        choice(w.ask(r.subPoint, r.mustConvey.join("; ")), {
          good: w.good,
          skipped: w.skipped,
          confused: w.confused,
        }),
      ]),
    ),
    `judge-${mode}`,
  );
  const verdicts = p.rubric.flatMap((_, i): Row[] => {
    const v = sureChoice(a?.[`row_${i}`]) as Row["verdict"] | undefined;
    return v ? [{ i, verdict: v }] : [];
  });
  if (!verdicts.length) return null;
  return {
    verdict: { verdicts },
    tell: `these rubric rows are ruled — ${verdicts.map((v) => `row ${v.i}: "${v.verdict}"`).join(", ")}. Rule any other row yourself.`,
    pin: pinRows,
  };
}
