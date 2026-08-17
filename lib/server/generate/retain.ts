// ---- kind: retain ----------------------------------------------------------
import {
  arr,
  fail,
  interestNote,
  languageNote,
  obj,
  oneOf,
  sizeRule,
  str,
  user,
} from "./common";
import { RetainContent, ReviewCard } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

const CARD_TYPES = ["recall", "why", "apply"] as const;

/** How many cards one Retain draft may carry, whatever the rotation looks like.
 *  The band the prompt asks for is narrower and derived per request — see
 *  `retainCardBounds` — since the honest count is roughly one card per node the
 *  learner actually has in rotation. */
export const RETAIN_CARD_BOUNDS = { min: 3, max: 8 } as const;

/** The band to ask this particular draft for: about one card per node in
 *  rotation, clamped into `RETAIN_CARD_BOUNDS`. A three-node rotation asking
 *  for six cards got six — four of them second and third cuts at the same fact,
 *  which is exactly what a review queue must not be made of. */
export function retainCardBounds(nodeCount: number): {
  min: number;
  max: number;
} {
  const target = Math.max(
    RETAIN_CARD_BOUNDS.min,
    Math.min(RETAIN_CARD_BOUNDS.max, nodeCount),
  );
  return {
    min: Math.max(RETAIN_CARD_BOUNDS.min, target - 1),
    max: Math.min(RETAIN_CARD_BOUNDS.max, target + 1),
  };
}

/**
 * The Retain generation is a card FACTORY, not the queue.
 *
 * What it produces is converted once into `StoredCard`s and then lives in the
 * FSRS store forever; the queue the learner actually sees is rebuilt from that
 * store by `retainContentFromStore`. So three things this prompt used to ask
 * for were generated, validated, cached — and thrown away on arrival:
 *
 *   - `forecast`: rebuilt from real due dates by `forecastRows`.
 *   - each card's `fsrs` intervals: rebuilt from the real scheduler by
 *     `intervalLabels`. `newStoredCard` is typed `Omit<StoredCard, "fsrs">`
 *     precisely because it supplies its own.
 *   - each card's `id`: reassigned as `${node}-retain-${stamp}-${i}`.
 *
 * Together that was roughly a quarter of a blocking generation spent on
 * output nothing reads. Asking for plausible-looking spaced-repetition
 * intervals from a language model was always the wrong shape anyway — the
 * scheduler knows them exactly.
 */
export function validateRetain(budgetMin: number, nodeIds: Set<string>) {
  return (raw: unknown): RetainContent => {
    const root = obj(raw, "payload");
    const cards: ReviewCard[] = arr(
      root.cards,
      "cards",
      RETAIN_CARD_BOUNDS.min,
      RETAIN_CARD_BOUNDS.max,
    ).map((v, i) => {
      const c = obj(v, `cards[${i}]`);
      const node = str(c.node, `cards[${i}].node`)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-");
      if (!nodeIds.has(node)) fail(`cards[${i}].node "${node}" is not a learned node id`);
      const type = oneOf(c.type, CARD_TYPES, `cards[${i}].type`);
      const hasCloze = Array.isArray(c.cloze) && typeof c.answer === "string";
      const card: ReviewCard = {
        id: `r${i + 1}`,
        type,
        source: str(c.source, `cards[${i}].source`),
        node,
        // A cloze card's answer IS its back; models routinely omit `back`
        // there, and rejecting that blocked the whole Review queue.
        back: str(hasCloze ? (c.back ?? c.answer) : c.back, `cards[${i}].back`),
        fails: true,
        reExplain: str(c.reExplain, `cards[${i}].reExplain`),
      };
      if (hasCloze) {
        const cloze = arr(c.cloze, `cards[${i}].cloze`, 2, 2).map((s, j) =>
          str(s, `cards[${i}].cloze[${j}]`),
        );
        card.cloze = [cloze[0], cloze[1]];
        card.answer = str(c.answer, `cards[${i}].answer`);
      } else {
        card.front = str(c.front, `cards[${i}].front`);
      }
      return card;
    });
    return { budgetMin, cards };
  };
}

export async function generateRetain(params: {
  topic: string;
  budgetMin: number;
  nodes: Array<{ id: string; label: string; state: string }>;
  interests: string;
  language?: Language;
}): Promise<RetainContent> {
  const { topic, budgetMin, nodes, interests, language = "en" } = params;
  const band = retainCardBounds(nodes.length);
  return generateJson(
    user(
      `Draft the review cards for the topic "${topic}".
Cards are atomic — one fact each — and varied by type. Daily budget: ~${budgetMin} minutes.
The learner's nodes in rotation (id: label — state):
${nodes.map((n) => `- ${n.id}: ${n.label} — ${n.state}`).join("\n")}
${interestNote(interests)}

${sizeRule({
  unit: "cards",
  min: band.min,
  max: band.max,
  atMin: "a rotation whose nodes each carry one fact worth being asked for",
  atMax: "a rotation where a node genuinely holds two separate facts",
})} A node earns a second card only when it carries two facts that can be missed independently — never a second cut at the same one.

Write the cards only. Scheduling — when each card is next due, and what each
grade button is worth — is the scheduler's job, not yours.

Return JSON:
{
  "cards": [   // ${band.min}-${band.max} cards; mix of types; "recall" cards use cloze, "why"/"apply" use front
    {
      "type": "recall" | "why" | "apply",
      "source": "Consume" | "Socratic" | "Feynman" | "Connect" | "Crucible",   // which phase plausibly drafted it
      "node": "a node id from the list",
      "cloze": ["text before the blank ", " text after the blank"],   // recall only
      "answer": "what fills the blank",                                 // recall only
      "front": "the question",                                          // why/apply only
      "back": "the full answer revealed on flip, 1-2 sentences",
      "reExplain": "the 30-second Socratic re-explanation shown if this card is missed"
    }, ...
  ]
}${languageNote(language)}`,
    ),
    validateRetain(budgetMin, new Set(nodes.map((n) => n.id))),
    { label: "retain" },
  );
}
