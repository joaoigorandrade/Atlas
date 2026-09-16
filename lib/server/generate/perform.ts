// ---- kind: perform ---------------------------------------------------------
// One real case with real values, and the steps a correct run of it has to
// show. The rubric rows here are not points of an explanation — they are the
// things the work itself must contain, on this case.
//
// `loadBearing` is what makes the grader Perform's own: a step whose result
// everything after it depends on must actually have been carried out, while a
// sanity check the learner skipped makes the run thinner rather than wrong.

import {
  arr,
  boundaryNote,
  fail,
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
import type { NodeKind, PerformContent } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { ChatMessage, generateJson } from "@/lib/server/openrouter";
import { StreamFrame } from "@/lib/server/stream";

/** How many steps one run is graded on. */
export const PERFORM_STEP_BOUNDS = { min: 3, max: 6 } as const;

export function validatePerform(nodeId: string, nodeLabel: string) {
  return (raw: unknown): PerformContent => {
    const root = obj(raw, "payload");
    const steps = arr(
      root.steps,
      "steps",
      PERFORM_STEP_BOUNDS.min,
      PERFORM_STEP_BOUNDS.max,
    ).map((v, i) => {
      const s = obj(v, `steps[${i}]`);
      return {
        id: `pf-${nodeId}-${i + 1}`,
        step: str(s.step, `steps[${i}].step`),
        mustShow: arr(s.mustShow, `steps[${i}].mustShow`, 1, 3).map((m, j) =>
          rejectEcho(str(m, `steps[${i}].mustShow[${j}]`), `steps[${i}].mustShow[${j}]`),
        ),
        loadBearing: s.loadBearing !== false,
      };
    });
    // A run with no load-bearing step has no gate at all — everything would be
    // skippable and the phase would pass on an empty page.
    if (!steps.some((s) => s.loadBearing))
      fail("at least one step must be loadBearing — otherwise the run has no gate");
    return {
      nodeId,
      nodeLabel,
      task: str(root.task, "task"),
      scaffold: str(root.scaffold, "scaffold"),
      steps,
    };
  };
}

export interface PerformParams {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  nodeKind?: NodeKind;
  priorLabels?: string[];
  laterLabels?: string[];
}

export async function generatePerform(params: PerformParams): Promise<PerformContent> {
  const { topic, nodeLabel, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write an EXECUTION pass for the procedure "${nodeLabel}" within "${topic}": the learner is given ONE concrete case and carries the procedure out on it end to end, showing their work the way they would for real.
${interestNote(interests)}
${boundaryNote(params)}${kindNote(params.nodeKind, "perform")}

The case must be self-contained and specific — real values, real units, or a real situation — and must NOT say which steps to use or in what order. Working it out is the test.

The learner never sees the steps below. A step is a thing their WORK has to show on this case, not a thing they should understand.

Return JSON:
{
  "task": "the concrete case, stated in a sentence or two, with everything needed to work it and nothing that gives away the method",
  "scaffold": "one sentence offered ONLY if they stall — what to establish first, never a step's result",
  "steps": [
    { "step": "what this stage of the run produces (3-6 words)",
      "mustShow": ["1-3 specific, checkable things the work has to show here — an intermediate value, a ratio applied, a check performed. Concrete to THIS case"],
      "loadBearing": true },
    ...
  ]   // ${PERFORM_STEP_BOUNDS.min}-${PERFORM_STEP_BOUNDS.max} steps
}
Mark a step "loadBearing": false only when everything after it would still be correct without it — a units check, a plausibility check, a stated assumption. Every step that feeds the next is load-bearing, and at least one step must be.${languageNote(language)}`,
    ),
    validatePerform(params.nodeId, nodeLabel),
    { label: "perform" },
  );
}

// ---- the grader ------------------------------------------------------------

interface JudgePerformParams {
  topic: string;
  nodeLabel: string;
  /** The case they were given. */
  task: string;
  rubric: Array<{ subPoint: string; mustConvey: string[] }>;
  work: string;
  language?: Language;
}

function performJudgeMessages(params: JudgePerformParams): ChatMessage[] {
  const { topic, nodeLabel, task, rubric, work, language = "en" } = params;
  const rows = rubric
    .map((r, i) => `${i}. ${r.subPoint} — the work must show: ${r.mustConvey.join("; ")}`)
    .join("\n");
  return [
    JUDGE_SYSTEM,
    {
      role: "user",
      content: `The learner just carried out the procedure "${nodeLabel}" (topic: ${topic}) end to end, on one concrete case, showing their work.

The case: """${task}"""

The steps a correct run shows:
${rows}

Their work, verbatim: """${work}"""

Rule every step, by index:
- "good": the work genuinely carries this step out and its result is right. A different but valid method that produces the correct result for this step is "good" — you are checking the run, not a preferred route.
- "skipped": the step is simply missing from the run.
- "confused": the step was carried out and its result is WRONG.
Check the arithmetic and the units yourself before ruling. A correct method with a wrong number is "confused", not "good" — and a right final answer reached through a wrong intermediate value is still a wrong intermediate value.
On "skipped" and "confused", quote the learner's own work that earned it in \`quote\` — the exact fragment, under 20 words.

Return \`jargon\` as an empty array.

In \`response\`, 2-4 sentences, as someone checking the work. Say where the run holds and where it breaks, naming the step and what it produced. Never smooth over a wrong result.

Return JSON: {"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one per step], "response": "...", "jargon": []}${languageNote(language)}`,
    },
  ];
}

export async function judgePerform(
  params: JudgePerformParams,
): Promise<FeynmanJudgement> {
  return generateJson(
    performJudgeMessages(params),
    validateFeynmanJudgement(params.rubric.length),
    { label: "judge-perform", role: "judge" },
  );
}

export function judgePerformStream(
  params: JudgePerformParams,
): AsyncGenerator<StreamFrame> {
  const count = params.rubric.length;
  return judgeStream<FeynmanJudgement>(performJudgeMessages(params), {
    firstShape: `{"verdicts": [{"i": 0, "verdict": "good" | "skipped" | "confused", "quote": "..."}, ...one per step]}`,
    first: (raw) => ({ verdicts: validateFeynmanVerdicts(raw, count) }),
    full: validateFeynmanJudgement(count),
    label: "judge-perform",
  });
}
