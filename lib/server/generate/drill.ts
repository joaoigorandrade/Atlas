// ---- kind: drill -----------------------------------------------------------
// Bare reps: a prompt, two or three short answers, no setup. The learner is
// timed, so every rep must be answerable in a few seconds by someone who has
// the concept and unguessable by someone who does not — and the wrong answers
// have to be the slips made *at speed*, not leisurely conceptual distractors.

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
import type { DrillContent, NodeKind } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

export const DRILL_REP_BOUNDS = { min: 5, max: 8 } as const;

/** A rep's answers have to be short, or the learner is reading rather than
 *  recalling and the clock measures comprehension speed instead. */
const MAX_ANSWER_CHARS = 60;

export function validateDrill(nodeId: string, nodeLabel: string) {
  return (raw: unknown): DrillContent => {
    const root = obj(raw, "payload");
    const reps = arr(root.reps, "reps", DRILL_REP_BOUNDS.min, DRILL_REP_BOUNDS.max).map(
      (v, i) => {
        const r = obj(v, `reps[${i}]`);
        const answers = arr(r.answers, `reps[${i}].answers`, 2, 4).map((a, j) =>
          rejectEcho(str(a, `reps[${i}].answers[${j}]`), `reps[${i}].answers[${j}]`),
        );
        const answerIndex =
          typeof r.answerIndex === "number" ? Math.trunc(r.answerIndex) : NaN;
        if (
          !Number.isFinite(answerIndex) ||
          answerIndex < 0 ||
          answerIndex >= answers.length
        )
          fail(`reps[${i}].answerIndex must be an answer index 0-${answers.length - 1}`);
        if (new Set(answers.map((a) => a.trim().toLowerCase())).size !== answers.length)
          fail(`reps[${i}].answers must all differ`);
        const long = answers.find((a) => a.length > MAX_ANSWER_CHARS);
        if (long)
          fail(
            `reps[${i}].answers must each be under ${MAX_ANSWER_CHARS} characters — a timed rep is recalled, not read (got "${long.slice(0, 40)}…")`,
          );
        return {
          id: `dr-${nodeId}-${i + 1}`,
          prompt: str(r.prompt, `reps[${i}].prompt`),
          answers,
          answerIndex,
          rule: str(r.rule, `reps[${i}].rule`),
        };
      },
    );
    if (new Set(reps.map((r) => r.answerIndex)).size === 1)
      fail("answerIndex must not be the same on every rep");
    return { nodeId, nodeLabel, reps };
  };
}

export interface DrillParams {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  nodeKind?: NodeKind;
  priorLabels?: string[];
  laterLabels?: string[];
}

export async function generateDrill(params: DrillParams): Promise<DrillContent> {
  const { topic, nodeLabel, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write a DRILL pass for "${nodeLabel}" within "${topic}": the same small call made over and over until it stops being derived and starts being known.
${interestNote(interests)}
${boundaryNote(params)}${kindNote(params.nodeKind, "drill")}

The learner is TIMED. Every rep must be answerable in a few seconds by someone who has the concept, and impossible to guess by someone who does not. A rep is its prompt and nothing else — no scenario, no setup, no preamble.

Return JSON:
{
  "reps": [
    { "prompt": "the call, in the same short form every time",
      "answers": ["2-3 answers, a few words each and under ${MAX_ANSWER_CHARS} characters. The wrong ones are the slips made at speed: the off-by-one, the swapped pair, the inverted ratio — never a leisurely conceptual distractor"],
      "answerIndex": 0,
      "rule": "the one-line rule that produces the answer directly, phrased so that next time it fires instead of being worked out" },
    ...
  ]   // ${DRILL_REP_BOUNDS.min}-${DRILL_REP_BOUNDS.max} reps
}
Vary the surface of the reps (different values, different pairs) while keeping the call identical, and vary which index is correct.${languageNote(language)}`,
    ),
    validateDrill(params.nodeId, nodeLabel),
    { label: "drill" },
  );
}
