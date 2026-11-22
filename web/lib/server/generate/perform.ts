// ---- kind: perform ---------------------------------------------------------
// One real case with real values, and the steps a correct run of it has to
// show. The rubric rows here are not points of an explanation — they are the
// things the work itself must contain, on this case.
//
// `loadBearing` is what makes the grader Perform's own: a step whose result
// everything after it depends on must actually have been carried out, while a
// sanity check the learner skipped makes the run thinner rather than wrong.

import { ownMethod } from "./verify";
import { cellNote } from "./cellNote";
import type { Cell } from "@/lib/curriculum";
import {
  type Boundary,
  arr,
  boundaryNote,
  fail,
  filled,
  domainNote,
  kindNote,
  languageNote,
  obj,
  rejectEcho,
  user,
} from "./common";
import {
  JUDGE_SYSTEM,
  judgeStream,
  learnerText,
  verdictPrefix,
  VERDICT_FIRST_SHAPE,
  validateFeynmanJudgement,
  type FeynmanJudgement,
} from "./judge";
import type { Domain, NodeKind, PerformContent } from "@/lib/curriculum";
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
        step: filled(s.step, `steps[${i}].step`),
        mustShow: arr(s.mustShow, `steps[${i}].mustShow`, 1, 3).map((m, j) =>
          rejectEcho(
            filled(m, `steps[${i}].mustShow[${j}]`),
            `steps[${i}].mustShow[${j}]`,
          ),
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
      task: filled(root.task, "task"),
      scaffold: filled(root.scaffold, "scaffold"),
      steps,
    };
  };
}

export interface PerformParams extends Boundary {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  language?: Language;
  nodeKind?: NodeKind;
  domain?: Domain;
  /** The node's cell — `cellNote`; server-stamped, never from a client. */
  cell?: Cell;
  /** How many runs this node has had — server-stamped from the attempts log. */
  rerun?: number;
  /** The lesson the learner read for this node — server-stamped, see `withNodeCell`. */
  lesson?: string;
}

export async function generatePerform(params: PerformParams): Promise<PerformContent> {
  // W2.4: a case a prerequisite's method cracks is written again, once.
  return ownMethod(
    params,
    (c) => c.task,
    () => writePerform(params),
  );
}

/**
 * The case and its hidden answer key, structured around what the run is for.
 *
 * - The steps are the procedure's SUBGOALS, named in the lesson's vocabulary:
 *   the learner only sees them in the report afterwards, so the report is
 *   where the procedure's shape is learned — the same labels Consume's worked
 *   example leads its steps with.
 * - `mustShow` carries the correct VALUE wherever a step produces one, so the
 *   judge compares against a key instead of re-deriving the case under a
 *   verdict-first deadline (reference-guided grading).
 * - The case is sized in minutes, with clean numbers: an oversized case spends
 *   the learner's time on arithmetic, which is not what this rung measures.
 *
 * No `interestNote`: a run has no analogy to flavour, and the prompt never
 * used the interests for anything else (they are also out of the key; job.ts).
 */
async function writePerform(params: PerformParams): Promise<PerformContent> {
  const { topic, nodeLabel, language = "en" } = params;
  // The lesson (up to 16k characters) goes FIRST, before any instruction: a
  // long document placed between the case rules and the step rules sat in the
  // part of the prompt models use worst, and pushed the step rules after it.
  return generateJson(
    user(
      `${lessonBlock(params.lesson)}Write an EXECUTION pass for the procedure "${nodeLabel}" within "${topic}": the learner is given ONE concrete case and carries the procedure out on it end to end, showing their work the way they would for real. Nobody tells them the steps — working out what to do is part of the test.

THE CASE ("task"):
- Self-contained and specific: real values and units, or a real situation, with everything needed to work it, in a sentence or two.
- It never names the steps, their order or the method.
- Its method is the one "${nodeLabel}" names and nothing lighter. A case a prerequisite's method already cracks (two unknowns solved by substitution when the node is row reduction) is the wrong case — size it until only this method works (three unknowns, a free variable, an inconsistency).
- Sized to be worked in about 5-10 minutes by someone who has the procedure: a run, not a project. Choose values that keep the arithmetic clean, so that the hard part is the procedure, not the sums.${
        params.rerun
          ? `\n- The learner has already run this procedure on a case like this ${params.rerun} time(s) and seen the report. Same procedure, different values and a different surface — nothing from an earlier case may carry over as an answer.`
          : ""
      }${lessonRule(params.lesson)}

THE STEPS are the hidden answer key the run is graded against. The learner never sees them before the run; afterwards each one is a line of their report.
- One step per subgoal of the procedure, in order. "step" names the subgoal in 3-6 words, in the vocabulary the lesson used ("Form the augmented matrix", never "Step 2"), so that the report teaches the procedure's shape.
- "mustShow": 1-3 specific, checkable things the work must contain at this step, each with its correct value on THIS case wherever the step produces one ("the pivot in row 1 is 2", "the net force, 14 N") — so the run is checked against a key, not re-derived. Never "understands" or "explains".
- "loadBearing": false only when everything after the step would still be correct without it — a units check, a plausibility check, a stated assumption. Every step that feeds the next is load-bearing, and at least one must be.

"scaffold" is offered ONLY if they stall: one sentence naming the first subgoal to reach, never its result.
${boundaryNote(params)}${kindNote(params.nodeKind, "perform")}${domainNote(params.domain, "perform")}${cellNote(params.cell, "perform")}
Where a note about this concept's kind, domain or weight differs from the rules above, the note wins.

Return JSON:
{
  "task": "…",
  "scaffold": "…",
  "steps": [
    { "step": "…", "mustShow": ["…"], "loadBearing": true },
    ...
  ]   // ${PERFORM_STEP_BOUNDS.min}-${PERFORM_STEP_BOUNDS.max} steps${languageNote(language)}`,
    ),
    validatePerform(params.nodeId, nodeLabel),
    { label: "perform" },
  );
}

/** The run tests what the lesson taught. Without this the case was written
 *  from the label alone, and graded commands and options the lesson never showed.
 *  Split in two: the document opens the prompt (`lessonBlock`), and the rule
 *  that binds the case to it sits with the case rules (`lessonRule`). */
function lessonBlock(lesson: string | undefined): string {
  if (!lesson) return "";
  return `WHAT THE LEARNER READ on this concept — the whole lesson, verbatim:
<lesson>
${lesson.split("</lesson>").join("")}
</lesson>

`;
}

function lessonRule(lesson: string | undefined): string {
  if (!lesson) return "";
  return `
- The run tests the lesson above. The case must be workable with the commands, operations, rules and notation the lesson (or a concept already taught) actually showed, and every mustShow must be something it taught them to do or read. Never require a command, option, flag, formula or technique it never showed — a run that turns on one grades outside knowledge, not the concept. Change the values and the situation, not the toolkit: the same moves as the lesson's worked example, on a case the learner has not already seen worked.`;
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

The answer key — what a correct run shows at each step, with the correct values where a step produces one:
${rows}

Their work:
${learnerText("work", work)}

Rule every step, by index. Compare the work against the key, and check the arithmetic and the units yourself: where the key gives a value, the learner's must equal it (an equivalent form — 0.5 for 1/2, a different but valid order of operations — still matches).
- "good": the work carries this step out and its result is right. A different valid method that reaches the right result is "good" — you are checking the run, not a preferred route.
- "skipped": the step is missing from the run.
- "confused": the step was carried out and its result is WRONG. A correct method with a wrong number is "confused", and a right final answer reached through a wrong intermediate value is still a wrong intermediate value.
In each row, write \`quote\` BEFORE \`verdict\`: for a step you are about to rule "confused", the exact fragment of their work, under 20 words, that the ruling rests on; for "skipped" and "good", leave it empty.

Return \`jargon\` as an empty array.

In \`response\`, 2-4 sentences, as someone checking the work. Say where the run holds and where it breaks, naming the step. For the first broken step, say what went wrong and the rule that fixes it — what to do differently next time — without writing out the corrected value: the learner may come back to this same case. On a clean run, name what made it clean. Never smooth over a wrong result.

Return JSON: {"verdicts": [{"i": 0, "quote": "...", "verdict": "good" | "skipped" | "confused"}, ...one per step], "response": "...", "jargon": []}${languageNote(language)}`,
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
    firstShape: VERDICT_FIRST_SHAPE,
    first: verdictPrefix(count),
    full: validateFeynmanJudgement(count),
    label: "judge-perform",
  });
}
