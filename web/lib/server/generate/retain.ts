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
import { sizeDeck } from "./jev";
import { logWarning } from "@/lib/log";

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

/** The most cards one node may carry when Jev sizes its deck — the top of
 *  `DECK_SIZE` in jev.ts. Each Jev-sized node is drafted in its own call, so
 *  a big deck never has to fit one model request's timeout. */
export const RETAIN_NODE_CARD_MAX = 20;

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
export function validateRetain(
  budgetMin: number,
  nodeIds: Set<string>,
  max: number = RETAIN_CARD_BOUNDS.max,
) {
  return (raw: unknown): RetainContent => {
    const root = obj(raw, "payload");
    const cards: ReviewCard[] = arr(root.cards, "cards", RETAIN_CARD_BOUNDS.min, max).map(
      (v, i) => {
        const c = obj(v, `cards[${i}]`);
        const node = slug(c.node, `cards[${i}].node`);
        if (!nodeIds.has(node))
          fail(`cards[${i}].node "${node}" is not a learned node id`);
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
          // A blank that ends the sentence leaves nothing after it: the model
          // writes "…" or "" there, which is a full stop, not a missing part.
          const cloze = arr(c.cloze, `cards[${i}].cloze`, 2, 2).map((s, j) =>
            j === 1 && typeof s === "string" && /^[.…\s]*$/.test(s)
              ? "."
              : filled(s, `cards[${i}].cloze[${j}]`),
          );
          card.cloze = [cloze[0], cloze[1]];
          card.answer = filled(c.answer, `cards[${i}].answer`);
        } else {
          card.front = filled(c.front, `cards[${i}].front`);
        }
        return card;
      },
    );
    return { budgetMin, cards };
  };
}

/** A draft's nodes as keyed: learned nodes only, each with at most four of its
 *  reading's key ideas — a card per idea (`retainCardBounds` counts them) — and
 *  the reading itself, capped at `readingCap`. A node sent without either keys
 *  exactly as it did before they existed. */
export function retainNodes(raw: unknown, cap: number, readingCap = 0): RetainNode[] {
  return (Array.isArray(raw) ? raw : [])
    .filter(
      (n): n is RetainNode & { takeaways?: unknown; reading?: unknown } =>
        typeof n === "object" &&
        n !== null &&
        [n.id, n.label, n.state].every((v) => typeof v === "string") &&
        (!("summary" in n) || typeof n.summary === "string"),
    )
    .slice(0, cap)
    .map(({ takeaways, reading, ...rest }) => {
      const ideas = (Array.isArray(takeaways) ? takeaways : [])
        .filter((x): x is string => typeof x === "string" && !!x.trim())
        .slice(0, 4)
        .map((x) => x.slice(0, 300));
      const text = typeof reading === "string" ? reading.trim().slice(0, readingCap) : "";
      return {
        ...rest,
        ...(ideas.length ? { takeaways: ideas } : null),
        ...(text ? { reading: text } : null),
      };
    });
}

type RetainNode = {
  id: string;
  label: string;
  state: string;
  summary?: string;
  /** The reading's key ideas — each one a fact that can be missed alone. */
  takeaways?: string[];
  /** The whole reading (`sectionText`): what a Jev-sized deck must cover. */
  reading?: string;
};

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
  nodes: RetainNode[];
  language?: Language;
}): Promise<RetainContent> {
  const { topic, budgetMin, nodes, language = "en" } = params;
  // Jev decides each node's deck: everything important plus its edge cases.
  // Each node is drafted on its own, in parallel, so the deck can be large.
  const sized = await sizeDeck(topic, nodes);
  if (sized) {
    const drafts = await Promise.allSettled(
      nodes.map((n) => {
        const [min, max] = sized[n.id] ?? [5, 7];
        return draftCards(topic, budgetMin, [n], { min, max }, language, true);
      }),
    );
    drafts.forEach((d, i) => {
      if (d.status === "rejected")
        logWarning("retain_node_failed", d.reason, { topic, node: nodes[i].id });
    });
    const cards = drafts.flatMap((d) => (d.status === "fulfilled" ? d.value.cards : []));
    // Every node failed: surface the error the caller already handles.
    if (!cards.length) throw (drafts[0] as PromiseRejectedResult).reason;
    return { budgetMin, cards: cards.map((c, i) => ({ ...c, id: `r${i + 1}` })) };
  }
  // No Jev: one card per thing the learner was taught — a reading's key ideas
  // when the client sent them, else the node's one sentence.
  const band = retainCardBounds(
    nodes.reduce((n, node) => n + Math.max(1, node.takeaways?.length ?? 0), 0),
  );
  return draftCards(topic, budgetMin, nodes, band, language, false);
}

function draftCards(
  topic: string,
  budgetMin: number,
  nodes: RetainNode[],
  band: { min: number; max: number },
  language: Language,
  thorough: boolean,
): Promise<RetainContent> {
  return generateJson(
    user(
      `Write the review cards for the topic "${topic}": the spaced-repetition cards that keep these concepts alive for months. Each card will be answered many times, weeks apart, by someone who has not looked at the material since — so a card is a small retrieval task you are designing for that future learner.

The concepts in rotation (id: label — state — what it taught):
${nodes.map((n) => `- ${n.id}: ${n.label} — ${n.state}${n.takeaways?.length ? `\n${n.takeaways.map((k) => `    · ${k}`).join("\n")}` : n.summary ? ` — ${n.summary.slice(0, 400)}` : ""}${thorough && n.reading ? `\n  The reading it taught:\n<<<\n${n.reading}\n>>>` : ""}`).join("\n")}

Every card asks only for what its node teaches, as summarised here${thorough ? ", or what a standard course on exactly this concept treats as part of it (its rules, conditions, exceptions and classic pitfalls)" : ""}. Never a real-world spec, typical value, date or name the node does not cover: a card about something the learner was never taught grades trivia, not memory. If a card needs a value to be answered, state it on the card.

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

${
  thorough
    ? `SIZE: write ${band.min}-${band.max} cards — the learner must remember EVERYTHING important here, edge cases included. Cover every key idea (·) first, then every special case, exception or warning the reading names — each its own card, for each method or situation it applies to — then spend the rest on what a learner gets wrong: boundary conditions, exceptions to the rule, the case where it does NOT apply, the look-alike it is confused with, a sign or unit that flips the result, a common wrong answer and why it fails. An edge case must follow from the concept itself, not from trivia it never covers. Ask every important fact from more than one angle — recall it, explain why it holds, apply it to a fresh case — since each is a separate retrieval. Each card still asks one distinct thing, never the same question reworded.

DIFFICULTY: these cards keep someone who studied the concept sharp, so none may be passed by common sense or by reading the question. A cloze blank is never a word the sentence's grammar or an everyday meaning gives away (not "linear" after "applies to circuits that are…", not "separately" after "each source is computed…"): nor a bare "zero", "equal" or "opposite" the rule's name already implies: blank the condition, value or rule a learner actually forgets. At most a third of the cards are "recall", and a definition's own wording is never one: test each cloze by asking whether someone who never studied this could fill it from the rest of the sentence or the word's everyday sense ("a loop with no other loop ___" → inside it; "the law of ___" after naming currents) — if so, drop it and write an "apply" or "why" card instead. An "apply" case needs the method itself to solve — at least two real steps of it, with its numbers stated — never a single sum, one division or a one-step lookup, and its case differs from the reading's worked examples. Prefer the case that catches the classic mistake: the sign, the condition or the exception that a learner who half-knows the rule gets wrong.
An "apply" case must have exactly one reading: name where each element connects (both of its ends), never "a node connects by two resistors". Before its "back", write "work": the full solution step by step, then check the result a second way (substitute it back, or another method). If the check disagrees, fix the case and solve again; "back" is the checked result only.`
    : `${sizeRule({
        unit: "cards",
        min: band.min,
        max: band.max,
        atMin: "a rotation whose nodes each carry one fact worth being asked for",
        atMax: "a rotation where a node genuinely holds two separate facts",
      })} A node earns a second card only when it carries two facts that can be missed independently — never a second cut at the same one. Where a node lists its key ideas (·), each idea is such a fact and earns its own card, as far as the count allows.`
}

Write the cards only. Scheduling — when each card is next due, and what each grade button is worth — is the scheduler's job, not yours.

Return JSON:
{
  "cards": [   // ${band.min}-${band.max} cards
    {
      "type": "recall" | "why" | "apply",
      "node": "a node id from the list",
      "cloze": ["text before the blank", "text after the blank"],   // recall only
      "answer": "…",                                                // recall only
      "front": "…",                                                 // why / apply only${
        thorough
          ? `
      "work": "…",                                                  // apply only: solved, then checked`
          : ""
      }
      "back": "…",
      "reExplain": "…"
    }, ...
  ]
}

Two filled-in cards from an unrelated concept (reading a 24-hour clock), to show the precision expected — copy their FORM, never their content:
{"type": "recall", "node": "…", "cloze": ["On a 24-hour clock, an hour past 12 becomes the 12-hour time when you", "from it."], "answer": "subtract 12", "back": "subtract 12", "reExplain": "The 24-hour clock keeps counting after noon instead of starting again at 1. So 13 is one hour past noon. What do you take away from 13 to land back on 1?"}
{"type": "why", "node": "…", "front": "On a 24-hour clock, why is 00:30 just after midnight rather than just after noon?", "back": "Because the 24-hour day starts counting at midnight, so hour 00 is the first hour after it.", "reExplain": "Noon is halfway through the count, at 12. Where does a count of 24 hours have to start for 12 to land in the middle?"}${languageNote(language)}`,
    ),
    validateRetain(
      budgetMin,
      new Set(nodes.map((n) => n.id)),
      thorough ? RETAIN_NODE_CARD_MAX : RETAIN_CARD_BOUNDS.max,
    ),
    { label: "retain" },
  );
}
