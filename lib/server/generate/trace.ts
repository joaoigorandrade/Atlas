// ---- kind: trace -----------------------------------------------------------
// The links of ONE chain on ONE running case, in order. The hard requirement
// the prompt carries — and the validator cannot check — is continuity: stage
// two begins from where stage one ended. A set of independent items about the
// same concept would render identically and test nothing the other phases
// don't already.

import {
  type Boundary,
  arr,
  boundaryNote,
  fail,
  interestNote,
  domainNote,
  kindNote,
  languageNote,
  obj,
  rejectEcho,
  str,
  user,
} from "./common";
import type { Domain, NodeKind, TraceContent } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

export const TRACE_STAGE_BOUNDS = { min: 4, max: 6 } as const;

export function validateTrace(nodeId: string, nodeLabel: string) {
  return (raw: unknown): TraceContent => {
    const root = obj(raw, "payload");
    const stages = arr(
      root.stages,
      "stages",
      TRACE_STAGE_BOUNDS.min,
      TRACE_STAGE_BOUNDS.max,
    ).map((v, i) => {
      const s = obj(v, `stages[${i}]`);
      const nexts = arr(s.nexts, `stages[${i}].nexts`, 2, 4).map((n, j) =>
        rejectEcho(str(n, `stages[${i}].nexts[${j}]`), `stages[${i}].nexts[${j}]`),
      );
      const answerIndex =
        typeof s.answerIndex === "number" ? Math.trunc(s.answerIndex) : NaN;
      if (!Number.isFinite(answerIndex) || answerIndex < 0 || answerIndex >= nexts.length)
        fail(`stages[${i}].answerIndex must be a next-stage index 0-${nexts.length - 1}`);
      if (new Set(nexts.map((n) => n.trim().toLowerCase())).size !== nexts.length)
        fail(`stages[${i}].nexts must all differ`);
      return {
        id: `tr-${nodeId}-${i + 1}`,
        reached: str(s.reached, `stages[${i}].reached`),
        nexts,
        answerIndex,
        handsOn: str(s.handsOn, `stages[${i}].handsOn`),
      };
    });
    if (new Set(stages.map((s) => s.answerIndex)).size === 1)
      fail("answerIndex must not be the same on every stage");
    return { nodeId, nodeLabel, scenario: str(root.scenario, "scenario"), stages };
  };
}

export interface TraceParams extends Boundary {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  nodeKind?: NodeKind;
  domain?: Domain;
}

export async function generateTrace(params: TraceParams): Promise<TraceContent> {
  const { topic, nodeLabel, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write a TRACE pass for "${nodeLabel}" within "${topic}": the learner walks the mechanism one stage at a time, saying at each stage what it hands the next.
${interestNote(interests)}
${boundaryNote(params)}${kindNote(params.nodeKind, "trace")}${domainNote(params.domain, "trace")}

THE STAGES ARE THE LINKS OF ONE CHAIN ON ONE RUNNING CASE, IN ORDER. Stage 1 starts the case; every later stage begins from where the previous one ended and never repeats it. If the stages could be shuffled without anything reading oddly, this is the wrong shape.

Each stage is committed before it is revealed, so none may name its own next stage.

Return JSON:
{
  "scenario": "the one case the whole chain walks, in a sentence or two",
  "stages": [
    { "reached": "where the case has got to at this point — written as what the PREVIOUS stage produced",
      "nexts": ["2-4 candidate next stages. The wrong ones skip a stage, reverse two that are order-dependent, or carry forward a quantity the previous stage actually changed — the ways a chain is really misremembered"],
      "answerIndex": 0,
      "handsOn": "why this stage follows from the last one: what it consumes, what it produces, and what breaks if it runs out of order" },
    ...
  ]   // ${TRACE_STAGE_BOUNDS.min}-${TRACE_STAGE_BOUNDS.max} stages
}
Vary which index is correct.${languageNote(language)}`,
    ),
    validateTrace(params.nodeId, nodeLabel),
    { label: "trace" },
  );
}
