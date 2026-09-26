// ---- kind: discriminate ----------------------------------------------------
// Candidate cases, described without naming anything, and the neighbouring
// concepts a learner actually confuses them with. Roughly half are genuine
// instances; the rest are near-misses that someone who memorised the
// definition would wave through — which is the error the phase's gate is built
// around (`discriminateFalsePositives`).

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
import type { DiscriminateContent, Domain, NodeKind } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

export const DISCRIMINATE_CASE_BOUNDS = { min: 4, max: 6 } as const;

export function validateDiscriminate(nodeId: string, nodeLabel: string) {
  return (raw: unknown): DiscriminateContent => {
    const root = obj(raw, "payload");
    const cases = arr(
      root.cases,
      "cases",
      DISCRIMINATE_CASE_BOUNDS.min,
      DISCRIMINATE_CASE_BOUNDS.max,
    ).map((v, i) => {
      const c = obj(v, `cases[${i}]`);
      const readings = arr(c.readings, `cases[${i}].readings`, 2, 4).map((r, j) =>
        rejectEcho(str(r, `cases[${i}].readings[${j}]`), `cases[${i}].readings[${j}]`),
      );
      const answerIndex =
        typeof c.answerIndex === "number" ? Math.trunc(c.answerIndex) : NaN;
      if (
        !Number.isFinite(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= readings.length
      )
        fail(`cases[${i}].answerIndex must be a reading index 0-${readings.length - 1}`);
      // Two identical readings make the case ungradeable: the learner can be
      // right and marked wrong, which a boundary test may never do.
      if (new Set(readings.map((r) => r.trim().toLowerCase())).size !== readings.length)
        fail(`cases[${i}].readings must all differ`);
      return {
        id: `dc-${nodeId}-${i + 1}`,
        candidate: str(c.candidate, `cases[${i}].candidate`),
        readings,
        answerIndex,
        decidedBy: str(c.decidedBy, `cases[${i}].decidedBy`),
        isInstance: c.isInstance === true,
      };
    });
    // A run of all instances (or none) cannot test a boundary — and the gate's
    // over-inclusion clause would have nothing to measure.
    const instances = cases.filter((c) => c.isInstance).length;
    if (instances === 0 || instances === cases.length)
      fail("cases must mix genuine instances with near-misses");
    if (new Set(cases.map((c) => c.answerIndex)).size === 1)
      fail("answerIndex must not be the same on every case");
    return { nodeId, nodeLabel, ask: str(root.ask, "ask"), cases };
  };
}

export interface DiscriminateParams extends Boundary {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  nodeKind?: NodeKind;
  domain?: Domain;
}

export async function generateDiscriminate(
  params: DiscriminateParams,
): Promise<DiscriminateContent> {
  const { topic, nodeLabel, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write a DISCRIMINATION pass for the concept "${nodeLabel}" within "${topic}": the learner decides, case by case, whether something IS an instance of it — and when it is not, which neighbouring concept it actually is.
${interestNote(interests)}
${boundaryNote(params)}${kindNote(params.nodeKind, "discriminate")}${domainNote(params.domain, "discriminate")}

Each case is committed before it is revealed, so nothing in a case may give its own answer away: never name a concept inside the case itself, and no "note that…".

Return JSON:
{
  "ask": "the one short question asked of every case (e.g. 'Which reading best classifies this case?')",
  "cases": [
    { "candidate": "one concrete case in a sentence or two, naming NO concept",
      "readings": ["3-4 candidate readings: the correct one plus the neighbouring concepts a learner really confuses it with. Name real neighbours from this topic — never 'none of the above', and never an option nobody would pick"],
      "answerIndex": 0,
      "decidedBy": "the specific feature present or missing in THIS case that puts it on one side of the boundary. Never 'because it matches the definition'",
      "isInstance": true },
    ...
  ]   // ${DISCRIMINATE_CASE_BOUNDS.min}-${DISCRIMINATE_CASE_BOUNDS.max} cases
}
Roughly half the cases must be genuine instances ("isInstance": true) and the rest near-misses that a learner who only memorised the definition would wave through. Vary which index is correct.${languageNote(language)}`,
    ),
    validateDiscriminate(params.nodeId, nodeLabel),
    { label: "discriminate" },
  );
}
