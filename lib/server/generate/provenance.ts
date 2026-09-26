// ---- kind: provenance ------------------------------------------------------
// One real source, and claims to rule against it. The whole phase turns on one
// distinction — what a document ASSERTS versus what its existence PROVES — so
// the prompt's main job is producing claims that actually separate the two.
//
// No judge: every claim ships its own ruling, and `provenancePassed` grades
// locally. One generation, no grading call, ever.

import {
  type Boundary,
  arr,
  boundaryNote,
  fail,
  languageNote,
  obj,
  oneOf,
  str,
  user,
} from "./common";
import {
  PROVENANCE_RULINGS,
  type Domain,
  type ProvenanceContent,
} from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

export const PROVENANCE_CLAIM_BOUNDS = { min: 5, max: 9 } as const;

export function validateProvenance(nodeId: string, nodeLabel: string) {
  return (raw: unknown): ProvenanceContent => {
    const root = obj(raw, "payload");
    const src = obj(root.source, "source");
    const claims = arr(
      root.claims,
      "claims",
      PROVENANCE_CLAIM_BOUNDS.min,
      PROVENANCE_CLAIM_BOUNDS.max,
    ).map((v, i) => {
      const c = obj(v, `claims[${i}]`);
      return {
        id: `pv-${nodeId}-${i + 1}`,
        claim: str(c.claim, `claims[${i}].claim`),
        ruling: oneOf(c.ruling, PROVENANCE_RULINGS, `claims[${i}].ruling`),
        because: str(c.because, `claims[${i}].because`),
      };
    });
    // A run where nothing is merely asserted cannot teach the distinction —
    // every claim would be ruled the same way, and the gate's over-trust cap
    // would have nothing to count.
    if (!claims.some((c) => c.ruling === "asserts"))
      fail(
        "at least one claim must be `asserts` — a run with none cannot separate a claim from a proof",
      );
    return {
      nodeId,
      nodeLabel,
      source: {
        title: str(src.title, "source.title"),
        attribution: str(src.attribution, "source.attribution"),
        date: str(src.date, "source.date"),
        excerpt: str(src.excerpt, "source.excerpt"),
      },
      claims,
      silence: str(root.silence, "silence"),
    };
  };
}

export interface ProvenanceParams extends Boundary {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  language?: Language;
  domain?: Domain;
}

export async function generateProvenance(
  params: ProvenanceParams,
): Promise<ProvenanceContent> {
  const { topic, nodeLabel, language = "en" } = params;
  return generateJson(
    user(
      `Write a SOURCE-READING pass for "${nodeLabel}" within "${topic}". The learner is handed one primary source and asked, of each claim, what this document will actually carry.
${boundaryNote(params)}

Use a REAL source a historian of this subject would recognise — name it, its author, its audience and its date accurately. Quote or closely paraphrase 60-150 words of it. Never invent a document, and never invent a passage inside a real one: if you are not sure of the wording, summarise it and say so in the excerpt.

Each claim is ruled exactly one of:
  "asserts" — the source states or implies it, and nothing more. That it was SAID is not that it was SO.
  "proves" — the existence of this document, from this author, at this date, establishes it. Usually a fact about the dispute itself: that the claim was being made, that the author held this office, that the question was live.
  "neither" — the source does not bear on it at all, in either direction.
Most claims should be "asserts": that is the ruling learners collapse into "proves", and the whole phase turns on the difference.

Return JSON:
{
  "source": {
    "title": "the document's name",
    "attribution": "who wrote it, to whom, and in what capacity",
    "date": "when",
    "excerpt": "60-150 words of it"
  },
  "claims": [
    { "claim": "a statement about the world, stated plainly",
      "ruling": "asserts" | "proves" | "neither",
      "because": "one sentence on why it is that ruling — for 'asserts', say what would be needed to settle it" },
    ...
  ],   // ${PROVENANCE_CLAIM_BOUNDS.min}-${PROVENANCE_CLAIM_BOUNDS.max} claims, at least one of them "asserts"
  "silence": "one sentence on whose account is missing from this source, and what that costs the reader"
}${languageNote(language)}`,
    ),
    validateProvenance(params.nodeId, nodeLabel),
    { label: "provenance" },
  );
}
