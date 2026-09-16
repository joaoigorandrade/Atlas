// ---- kinds: discriminate (and predict · trace · drill) ---------------------
// One generator for the deck family. Every one of them is a short run of
// committed-then-revealed items; what a phase asks for is its brief, which is
// the only place the four differ and the only place they should.
//
// Every item ships a closed form because grading is local: these phases live
// or die on the learner never waiting on a model between items. The learner
// still answers in their own words first — `OpenAnswer` maps that onto the
// index through the `choice` judge, exactly as the placement screen does.

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
import type { DeckContent, DeckPhase, NodeKind } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

/** How many items a deck run asks for. Short on purpose: the phase is a set of
 *  quick calls, and a twelve-item run is a quiz. */
export const DECK_ITEM_BOUNDS = { min: 4, max: 6 } as const;

/** Per-phase brief — what the items are, and what makes a good distractor. */
const BRIEFS: Record<
  DeckPhase,
  { ask: string; item: string; options: string; why: string }
> = {
  discriminate: {
    ask: "a DISCRIMINATION pass: the learner decides, case by case, whether something IS an instance of the concept — and when it is not, which neighbouring concept it actually is",
    item: "one concrete candidate case, described in a sentence or two WITHOUT naming any concept. Roughly half must be genuine instances and the rest near-misses that a learner who has only memorised the definition would wave through",
    options:
      "3-4 candidate readings of this case: the correct one, plus the neighbouring concepts a learner actually confuses it with. Name real neighbours from this topic, never 'none of the above' and never an obviously silly option — a distractor nobody would pick tests nothing",
    why: "what in THIS case decides it: the specific feature present or missing that puts it on one side of the boundary. Never 'because it matches the definition'",
  },
  predict: {
    ask: "a PREDICTION pass: the learner is given a situation the concept governs and must say what HAPPENS before being shown — the forecast is the test, and it is worthless once the answer is visible",
    item: "one concrete situation the concept governs, with whatever values or conditions the forecast turns on, stated plainly. Never hint at the outcome, and never use a case worked in the reading",
    options:
      "2-4 candidate outcomes. The wrong ones are what the learner predicts when they hold the relation backwards, ignore a condition, or expect the effect to be linear when it is not — real forecasts, not absurdities",
    why: "the causal chain that made this outcome the one that had to happen: which stage hands what to the next. Never a restatement of the outcome",
  },
  drill: {
    ask: "a DRILL pass: the same small call made over and over until it stops being derived and starts being known. The learner is timed, so every item must be answerable in a few seconds by someone who has the concept, and impossible to guess by someone who does not",
    item: "leave this out — a drill item is its prompt and nothing else. Return no context field",
    options:
      "2-3 short answers, a few words each. The wrong ones are the slips a learner makes when they are going fast: the off-by-one, the swapped pair, the neighbouring case — never a leisurely conceptual distractor",
    why: "the one-line rule that produces the answer directly, phrased so that next time it fires instead of being worked out",
  },
};

export function validateDeck(phase: DeckPhase, nodeId: string, nodeLabel: string) {
  return (raw: unknown): DeckContent => {
    const root = obj(raw, "payload");
    const items = arr(
      root.items,
      "items",
      DECK_ITEM_BOUNDS.min,
      DECK_ITEM_BOUNDS.max,
    ).map((v, i) => {
      const it = obj(v, `items[${i}]`);
      const options = arr(it.options, `items[${i}].options`, 2, 4).map((o, j) =>
        rejectEcho(str(o, `items[${i}].options[${j}]`), `items[${i}].options[${j}]`),
      );
      const answerIndex =
        typeof it.answerIndex === "number" ? Math.trunc(it.answerIndex) : NaN;
      if (
        !Number.isFinite(answerIndex) ||
        answerIndex < 0 ||
        answerIndex >= options.length
      )
        fail(`items[${i}].answerIndex must be an option index 0-${options.length - 1}`);
      // Two identical options make the item ungradeable — the learner can be
      // right and marked wrong, which is the one failure a boundary test may
      // never have.
      if (new Set(options.map((o) => o.trim().toLowerCase())).size !== options.length)
        fail(`items[${i}].options must all differ`);
      // Optional: a Drill item is its prompt and nothing else, so an absent
      // context is content rather than a malformed item.
      const context = typeof it.context === "string" ? it.context.trim() : "";
      return {
        id: `dk-${phase}-${nodeId}-${i + 1}`,
        ...(context ? { context } : {}),
        prompt: str(it.prompt, `items[${i}].prompt`),
        options,
        answerIndex,
        why: str(it.why, `items[${i}].why`),
      };
    });
    // A run whose answer is always the same index is one the learner can pass
    // by pattern, not by the boundary.
    if (items.length > 2 && new Set(items.map((i) => i.answerIndex)).size === 1)
      fail("answerIndex must not be the same on every item");
    return { nodeId, nodeLabel, items };
  };
}

export interface DeckParams {
  phase: DeckPhase;
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  nodeKind?: NodeKind;
  priorLabels?: string[];
  laterLabels?: string[];
}

export async function generateDeck(params: DeckParams): Promise<DeckContent> {
  const { phase, topic, nodeLabel, interests, language = "en" } = params;
  const f = BRIEFS[phase];
  return generateJson(
    user(
      `Write ${f.ask}, for the concept "${nodeLabel}" within "${topic}".
${interestNote(interests)}
${boundaryNote(params)}${kindNote(params.nodeKind, phase)}

Each item is committed before it is revealed, so nothing in an item may give its own answer away: no "note that…", no hedging, and never the concept's name inside the case itself.

Return JSON:
{
  "items": [
    { "context": "${f.item}",
      "prompt": "the question asked, in the same short form each time",
      "options": ["${f.options}"],
      "answerIndex": 0,
      "why": "${f.why}" },
    ...
  ]   // ${DECK_ITEM_BOUNDS.min}-${DECK_ITEM_BOUNDS.max} items
}
Vary which index is correct across the items.${languageNote(language)}`,
    ),
    validateDeck(phase, params.nodeId, nodeLabel),
    { label: `deck-${phase}` },
  );
}
