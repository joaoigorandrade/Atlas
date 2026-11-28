// ---- kind: summary ---------------------------------------------------------
// One concept's sentence, written on its own.
//
// A generated map writes every node's `summary` (see `SUMMARY_RULE`), but
// plenty of nodes on real maps have none: every run built before summaries
// existed, and any single concept whose sentence the generation dropped — both
// map validators accept a node without one rather than costing the learner the
// whole map over it. Those nodes fall back to copy about their mastery state,
// which is the same paragraph under every concept in that state and says
// nothing about the one just clicked. This backfills the missing sentence, one
// node at a time, so the rail always answers "what IS this".
import {} from "./verify";
import { SUMMARY_RULE } from "./map";

import { fail, languageNote, obj, str, user } from "./common";
import {} from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

/** The longest a summary may be. The rule asks for ~22 words; this is the
 *  validator's bound, wide enough that a legitimately long sentence passes and
 *  narrow enough that a runaway answer never reaches the rail — or the run
 *  snapshot it is persisted in. */
const SUMMARY_MAX = 400;

export interface SummaryParams {
  topic: string;
  nodeLabel: string;
  /** What this concept builds on — keeps the sentence at the right altitude
   *  (the next step past those, rather than re-teaching them). */
  prereqLabels: string[];
  language?: Language;
}

export function validateSummary(raw: unknown): string {
  const summary = str(obj(raw, "payload").summary, "summary");
  if (summary.length > SUMMARY_MAX)
    fail(
      `summary must be ONE sentence of at most ~22 words (got ${summary.length} characters)`,
    );
  return summary;
}

export async function generateSummary(params: SummaryParams): Promise<string> {
  const { topic, nodeLabel, prereqLabels, language = "en" } = params;
  const after = prereqLabels.length
    ? ` It sits after ${prereqLabels.join(", ")} on the map, so write it as the step past those rather than re-explaining them.`
    : "";
  return generateJson(
    user(
      `Write the one-sentence summary of the concept "${nodeLabel}", as it is taught inside the topic "${topic}".${after}

Return JSON:
{"summary": "one sentence on what this concept is"}

${SUMMARY_RULE}${languageNote(language)}`,
    ),
    validateSummary,
    { label: "concept-summary" },
  );
}
