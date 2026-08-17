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
import { SUMMARY_RULE } from "./map";

import { fail, languageNote, obj, str, user } from "./common";
import { validateDiagnosticQuestion } from "./map";
import { DiagnosticDifficulty, DiagnosticQuestion, GoalKind } from "@/lib/curriculum";
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

const DIFFICULTY_HINT: Record<DiagnosticDifficulty, string> = {
  easy: "a question anyone with cursory exposure to the topic would answer correctly",
  medium: "a question testing solid working knowledge, not just recognition",
  hard: "a question that separates genuine mastery from surface familiarity",
};

export interface DiagnosticQuestionParams {
  topic: string;
  goal: GoalKind;
  interests: string;
  language?: Language;
  /** Concept nodes this question may probe — already-asked nodes excluded, so
   *  the 5 questions never repeat a concept. */
  nodeCandidates: Array<{ id: string; label: string }>;
  difficulty: DiagnosticDifficulty;
}

/**
 * One objective, ENEM-style placement question at the requested difficulty —
 * its own call, made only once the learner has answered the previous one,
 * since the next difficulty depends on that answer (see `stepDifficulty`).
 */
export async function generateDiagnosticQuestion(
  params: DiagnosticQuestionParams,
): Promise<DiagnosticQuestion> {
  const { language = "en", nodeCandidates, difficulty } = params;
  const nodeIds = new Set(nodeCandidates.map((n) => n.id));
  const candidateList = nodeCandidates.map((n) => `${n.id} (${n.label})`).join(", ");
  const raw = await generateJson(
    user(
      `Write ONE placement question for a learner of "${params.topic}", probing one of these concepts: ${candidateList}.

The question must be ${DIFFICULTY_HINT[difficulty]}.

Return JSON:
{
  "nodeId": "the concept id from the list above this question probes",
  "q": "the question",
  "note": "one sentence on what the answer changes about the map",
  "opts": ["option A", "option B", "option C", "option D"],
  "correctIndex": 0,
  "gapLabel": "the precise sub-concept a miss exposes (2-4 words)",
  "gapReason": "why it exposes that, phrased to the learner ('you missed ...')"
}

Rules: exactly one of the 4 options is correct. Each of the other three is the answer produced by ONE specific, nameable misconception — the option a learner holding that exact wrong idea would confidently pick — never a throwaway. "gapLabel" and "gapReason" name the misconception behind the most likely of those three. Keep the question and options concise.${languageNote(language)}`,
    ),
    (r) => validateDiagnosticQuestion(r, nodeIds),
    { label: "diagnostic-question" },
  );
  return {
    // The concept this probes, not a counter: the panel renders `tag` inside
    // "<tag> and everything under it is marked known", and the progress bar
    // above it already carries the count (in the learner's language, which a
    // hardcoded "Question 3 of 5" never was).
    tag: nodeCandidates.find((n) => n.id === raw.nodeId)?.label ?? raw.nodeId,
    q: raw.q,
    note: raw.note,
    nodeId: raw.nodeId,
    difficulty,
    opts: raw.opts,
    correctIndex: raw.correctIndex,
    gap:
      raw.gapLabel && raw.gapReason
        ? {
            id: `gap-diag-${raw.nodeId}`,
            label: raw.gapLabel,
            reason: raw.gapReason,
            dx: -85,
            dy: 148,
          }
        : undefined,
  };
}
