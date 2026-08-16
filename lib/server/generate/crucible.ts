// ---- kind: crucible --------------------------------------------------------

// The ladder is fixed copy, not generated — so it is translated here rather
// than asked for from the model.
import {
  arr,
  boundaryNote,
  fail,
  interestNote,
  languageNote,
  obj,
  oneOf,
  rejectSelfIdenticalError,
  str,
  user,
} from "./common";
import { CrucibleContent } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

const RUNGS: Record<Language, Array<{ label: string }>> = {
  en: [
    { label: "Recall a definition" },
    { label: "Guided application" },
    { label: "Novel transfer" },
    { label: "Interleaved mix" },
    { label: "Boss · whole branch" },
  ],
  "pt-BR": [
    { label: "Lembrar uma definição" },
    { label: "Aplicação guiada" },
    { label: "Transferência inédita" },
    { label: "Mistura intercalada" },
    { label: "Chefão · ramo inteiro" },
  ],
};

export function validateCrucible(
  nodeId: string,
  nodeLabel: string,
  masteredLabels: string[],
  language: Language = "en",
) {
  return (raw: unknown): CrucibleContent => {
    const root = obj(raw, "payload");
    const problems = arr(root.problems, "problems", 2, 2).map((v, i) => {
      const p = obj(v, `problems[${i}]`);
      return {
        tag: str(p.tag, `problems[${i}].tag`),
        q: str(p.q, `problems[${i}].q`),
        hint: str(p.hint, `problems[${i}].hint`),
        placeholder: str(p.placeholder, `problems[${i}].placeholder`),
        sample: str(p.sample, `problems[${i}].sample`),
      };
    });
    const transfer = arr(root.transfer, "transfer", 3, 3).map((v, i) => {
      const t = obj(v, `transfer[${i}]`);
      return {
        verdict: oneOf(t.verdict, ["good", "red"] as const, `transfer[${i}].verdict`),
        text: rejectSelfIdenticalError(
          str(t.text, `transfer[${i}].text`),
          `transfer[${i}].text`,
        ),
      };
    });
    if (
      !transfer.some((t) => t.verdict === "red") ||
      !transfer.some((t) => t.verdict === "good")
    )
      fail("transfer needs at least one good and one red row");
    // "Drawn from your map" must be true: keep only draws that name real
    // mastered nodes; an interest or invented label is dropped (#15).
    const rawDraws = arr(root.draws, "draws", 1, 4).map((s, i) => str(s, `draws[${i}]`));
    const owned = new Map(masteredLabels.map((l) => [l.toLowerCase(), l]));
    const draws =
      masteredLabels.length === 0
        ? rawDraws // nothing to validate against on a fresh map
        : [
            ...new Set(
              rawDraws
                .map((d) => owned.get(d.toLowerCase()))
                .filter((d): d is string => !!d),
            ),
          ];
    if (draws.length < 1)
      fail(
        `draws must name concepts from the learner's map (${masteredLabels.join(", ")}) — never interests or invented labels`,
      );
    return {
      centerId: nodeId,
      centerLabel: nodeLabel,
      draws,
      rungs: RUNGS[language],
      gap: {
        id: `gap-cru-${nodeId}`,
        label: str(root.gapLabel, "gapLabel"),
        reason: str(root.gapReason, "gapReason"),
        dx: 165,
        dy: 78,
      },
      problems,
      transfer,
      reExplain: str(root.reExplain, "reExplain"),
    };
  };
}

export async function generateCrucible(params: {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  masteredLabels: string[];
  interests: string;
  language?: Language;
  priorLabels?: string[];
  laterLabels?: string[];
}): Promise<CrucibleContent> {
  const { topic, nodeId, nodeLabel, masteredLabels, interests, language = "en" } = params;
  return generateJson(
    user(
      `Write the Crucible (application/transfer) pass for the concept "${nodeLabel}" within "${topic}".
Force the knowledge into a NOVEL context it was never taught in — that's the truest mastery signal.
Concepts the learner already owns, to interleave: ${masteredLabels.join(", ") || "the concept's own prerequisites"}.
${interestNote(interests)}
${boundaryNote(params)}

Return JSON:
{
  "draws": ["2-3 owned concepts the problem interleaves"],
  "problems": [
    { "tag": "Novel transfer · a framing you were never handed",
      "q": "a concrete real-world problem that IS this concept wearing unfamiliar clothes — never name the concept",
      "hint": "a reframe that doesn't give it away",
      "placeholder": "workspace placeholder text",
      "sample": "a plausible learner attempt that gets MOST of it right but contains one precise, realistic error — the error must actually CHANGE the result: the wrong value, step or conclusion has to differ from the right one, never 'X instead of X'" },
    { "tag": "Guided application · one rung down",
      "q": "the same idea scaffolded: one step isolated, partially filled in",
      "hint": "the rule that closes the remaining step",
      "placeholder": "workspace placeholder text",
      "sample": "the correct completed attempt" }
  ],
  "transfer": [   // the diagnostic for the FIRST problem's sample attempt: what carried over, what didn't
    {"verdict": "good", "text": "sub-concept that transferred, and how it showed"},
    {"verdict": "good", "text": "another sub-concept that transferred"},
    {"verdict": "red", "text": "the precise sub-concept that did NOT carry over — name the error in the sample and the rule that fixes it. If you write 'A instead of B', A and B must genuinely differ"}
  ],
  "gapLabel": "that failed sub-concept as a map label (3-7 words)",
  "gapReason": "why it split out, phrased to the learner",
  "reExplain": "a 30-second Socratic re-explanation aimed straight at the gap, ending with one question"
}${languageNote(language)}`,
    ),
    validateCrucible(nodeId, nodeLabel, masteredLabels, language),
    { label: "crucible" },
  );
}
