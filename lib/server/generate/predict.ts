// ---- kind: predict ---------------------------------------------------------
// Situations the principle governs, and the outcomes a learner really forecasts
// when the mechanism is held wrong. The distractors carry this phase: a
// forecast task whose wrong answers are absurd tests nothing, because the
// learner picks the plausible one without consulting the mechanism at all.

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
import type { NodeKind, PredictContent } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

export const PREDICT_SETUP_BOUNDS = { min: 4, max: 6 } as const;

export function validatePredict(nodeId: string, nodeLabel: string) {
  return (raw: unknown): PredictContent => {
    const root = obj(raw, "payload");
    const setups = arr(
      root.setups,
      "setups",
      PREDICT_SETUP_BOUNDS.min,
      PREDICT_SETUP_BOUNDS.max,
    ).map((v, i) => {
      const s = obj(v, `setups[${i}]`);
      const outcomes = arr(s.outcomes, `setups[${i}].outcomes`, 2, 4).map((o, j) =>
        rejectEcho(str(o, `setups[${i}].outcomes[${j}]`), `setups[${i}].outcomes[${j}]`),
      );
      const answerIndex =
        typeof s.answerIndex === "number" ? Math.trunc(s.answerIndex) : NaN;
      if (
        !Number.isFinite(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= outcomes.length
      )
        fail(
          `setups[${i}].answerIndex must be an outcome index 0-${outcomes.length - 1}`,
        );
      if (new Set(outcomes.map((o) => o.trim().toLowerCase())).size !== outcomes.length)
        fail(`setups[${i}].outcomes must all differ`);
      return {
        id: `pd-${nodeId}-${i + 1}`,
        situation: str(s.situation, `setups[${i}].situation`),
        outcomes,
        answerIndex,
        because: str(s.because, `setups[${i}].because`),
      };
    });
    if (new Set(setups.map((s) => s.answerIndex)).size === 1)
      fail("answerIndex must not be the same on every setup");
    return { nodeId, nodeLabel, setups };
  };
}

export interface PredictParams {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  nodeKind?: NodeKind;
  priorLabels?: string[];
  laterLabels?: string[];
}

export async function generatePredict(params: PredictParams): Promise<PredictContent> {
  const { topic, nodeLabel, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write a PREDICTION pass for the principle "${nodeLabel}" within "${topic}": the learner is given a situation it governs and must say what HAPPENS before being shown.
${interestNote(interests)}
${boundaryNote(params)}${kindNote(params.nodeKind, "predict")}

The forecast is the test and it is worthless once the answer is visible, so no situation may hint at its own outcome, and none may reuse a case worked in the reading.

Return JSON:
{
  "setups": [
    { "situation": "one concrete situation the principle governs, with whatever values or conditions the forecast turns on, stated plainly",
      "outcomes": ["2-4 candidate outcomes. The wrong ones are what a learner really predicts when they hold the relation backwards, ignore a condition, or expect a non-linear effect to be linear — real forecasts, never absurdities"],
      "answerIndex": 0,
      "because": "the causal chain that made this outcome the one that HAD to happen — which stage hands what to the next. Never a restatement of the outcome" },
    ...
  ]   // ${PREDICT_SETUP_BOUNDS.min}-${PREDICT_SETUP_BOUNDS.max} setups
}
Vary which index is correct.${languageNote(language)}`,
    ),
    validatePredict(params.nodeId, nodeLabel),
    { label: "predict" },
  );
}
