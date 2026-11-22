// ---- kind: retain ----------------------------------------------------------
import {
  arr,
  fail,
  filled,
  languageNote,
  obj,
  oneOf,
  sizeRule,
  slug,
  user,
} from "./common";
import { RETAIN_DRAFT_NODES, RetainContent, ReviewCard } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

const CARD_TYPES = ["recall", "why", "apply"] as const;

/** The session a card is attributed to — the provenance line reads "from your
 *  {source} session". Stamped here, no longer asked for: the model was told to
 *  pick "which phase plausibly drafted it", which is metadata it could only
 *  invent, and a card attributed to a Socratic session on a procedure (whose
 *  plan has none) told the learner something false. Every plan opens with
 *  Consume, and a card asks only what the node's reading taught, so this one
 *  is true of every card. A truthful finer line needs the client to send the
 *  phases each node actually ran. */
const CARD_SOURCE = "Consume";

/** How many cards one Retain draft may carry, whatever the rotation looks like.
 *  The band the prompt asks for is narrower and derived per request — see
 *  `retainCardBounds` — since the honest count is roughly one card per node the
 *  learner actually has in rotation. */
export const RETAIN_CARD_BOUNDS = { min: 1, max: RETAIN_DRAFT_NODES } as const;

/** The band to ask this particular draft for: about one card per node in
 *  rotation, clamped into `RETAIN_CARD_BOUNDS`. A three-node rotation asking
 *  for six cards got six — four of them second and third cuts at the same fact,
 *  which is exactly what a review queue must not be made of. The floor used to
 *  be three whatever the rotation, so a single new node was asked for three
 *  cards by a prompt that also forbade a second cut at one fact: the model
 *  either padded or obeyed and failed validation. */
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
      const node = slug(c.node, `cards[${i}].node`);
      if (!nodeIds.has(node)) fail(`cards[${i}].node "${node}" is not a learned node id`);
      const type = oneOf(c.type, CARD_TYPES, `cards[${i}].type`);
      const hasCloze = Array.isArray(c.cloze) && typeof c.answer === "string";
      const card: ReviewCard = {
        id: `r${i + 1}`,
        type,
        source: CARD_SOURCE,
        node,
        // A cloze card's answer IS its back; models routinely omit `back`
        // there, and rejecting that blocked the whole Review queue.
        back: filled(hasCloze ? (c.back ?? c.answer) : c.back, `cards[${i}].back`),
        fails: true,
        reExplain: filled(c.reExplain, `cards[${i}].reExplain`),
      };
      if (hasCloze) {
        const cloze = arr(c.cloze, `cards[${i}].cloze`, 2, 2).map((s, j) =>
          filled(s, `cards[${i}].cloze[${j}]`),
        );
        card.cloze = [cloze[0], cloze[1]];
        card.answer = filled(c.answer, `cards[${i}].answer`);
      } else {
        card.front = filled(c.front, `cards[${i}].front`);
      }
      return card;
    });
    return { budgetMin, cards };
  };
}

/**
 * The card factory's prompt, organised around what a card has to survive:
 * months of reviews, weeks apart, by someone who has not seen the material
 * since. So it carries the card-writing rules a person would learn the hard
 * way (focused, precise, consistent, effortful, standing alone), picks the
 * card TYPE by what the node is rather than as a quota, and says plainly that
 * `back` is the grading key — a typed answer is judged against all of it
 * (`retainFlip` in `useRetain`), so anything extra written there becomes
 * something the learner is marked down for not reproducing.
 *
 * `budgetMin` and `interests` are not in the prompt: the daily budget sizes
 * the queue (`lib/fsrs.ts`), never a card, and a flash card has no analogy to
 * flavour. Interests are out of the cache key too (job.ts).
 */
export async function generateRetain(params: {
  topic: string;
  budgetMin: number;
  nodes: Array<{ id: string; label: string; state: string; summary?: string }>;
  language?: Language;
}): Promise<RetainContent> {
  const { topic, budgetMin, nodes, language = "en" } = params;
  const band = retainCardBounds(nodes.length);
  return generateJson(
    user(
      `Write the review cards for the topic "${topic}": the spaced-repetition cards that keep these concepts alive for months. Each card will be answered many times, weeks apart, by someone who has not looked at the material since — so a card is a small retrieval task you are designing for that future learner.

The concepts in rotation (id: label — state — what it taught):
${nodes.map((n) => `- ${n.id}: ${n.label} — ${n.state}${n.summary ? ` — ${n.summary.slice(0, 400)}` : ""}`).join("\n")}

Every card asks only for what its node teaches, as summarised here. Never a real-world spec, typical value, date or name the node does not cover: a card about something the learner was never taught grades trivia, not memory. If a card needs a value to be answered, state it on the card.

WHAT MAKES A CARD WORK:
- Focused: one detail per card. Never a list or a set on one card.
- Precise: exactly one answer counts, so any careful reviewer would mark the same answer right.
- Consistent: the same answer on every review.
- Effortful: the answer has to be retrieved, not recognised — no yes/no, nothing readable off the question's own wording.
- Standing alone: weeks from now, out of context, the learner must know what it asks, so name the topic or the case on the card itself.
- Distinct: no two cards share a cue, and no card is answered by another concept's answer.
- Short: a question under about 20 words, an answer of a few words.

PICK THE TYPE BY WHAT THE CONCEPT IS:
- "recall" for a definition, a name, a value, a symbol or a condition. A cloze: "cloze" is one sentence split around ONE blank, and "answer" fills it. The blank is the meaningful term — the quantity, the name, the relation — never a function word, and the words around it leave only one possible fill.
- "why" for a cause, a mechanism or a reason the concept rests on: "front" asks why or how; "back" is the reason, in one sentence.
- "apply" for a method or a rule: "front" gives a small concrete case, with any values it needs, and asks for the result or the next move; "back" is that result.

"back" is the key a typed answer is graded against. For "why" and "apply", put in it only what the learner must produce — the one sentence that counts, nothing added to explain it. For "recall", "back" is the answer alone: the filled blank already shows the whole sentence, and both apps hide a back that only repeats it.
"reExplain" is shown when the card is missed: under 60 words, it points at what forces the answer — the earlier idea it rests on, or one concrete case traced through — rather than restating the back, and it ends with one question.

${sizeRule({
  unit: "cards",
  min: band.min,
  max: band.max,
  atMin: "a rotation whose nodes each carry one fact worth being asked for",
  atMax: "a rotation where a node genuinely holds two separate facts",
})} A node earns a second card only when it carries two facts that can be missed independently — never a second cut at the same one.

Write the cards only. Scheduling — when each card is next due, and what each grade button is worth — is the scheduler's job, not yours.

Return JSON:
{
  "cards": [   // ${band.min}-${band.max} cards
    {
      "type": "recall" | "why" | "apply",
      "node": "a node id from the list",
      "cloze": ["text before the blank", "text after the blank"],   // recall only
      "answer": "…",                                                // recall only
      "front": "…",                                                 // why / apply only
      "back": "…",
      "reExplain": "…"
    }, ...
  ]
}

Two filled-in cards from an unrelated concept (reading a 24-hour clock), to show the precision expected — copy their FORM, never their content:
{"type": "recall", "node": "…", "cloze": ["On a 24-hour clock, an hour past 12 becomes the 12-hour time when you", "from it."], "answer": "subtract 12", "back": "subtract 12", "reExplain": "The 24-hour clock keeps counting after noon instead of starting again at 1. So 13 is one hour past noon. What do you take away from 13 to land back on 1?"}
{"type": "why", "node": "…", "front": "On a 24-hour clock, why is 00:30 just after midnight rather than just after noon?", "back": "Because the 24-hour day starts counting at midnight, so hour 00 is the first hour after it.", "reExplain": "Noon is halfway through the count, at 12. Where does a count of 24 hours have to start for 12 to land in the middle?"}${languageNote(language)}`,
    ),
    validateRetain(budgetMin, new Set(nodes.map((n) => n.id))),
    { label: "retain" },
  );
}
