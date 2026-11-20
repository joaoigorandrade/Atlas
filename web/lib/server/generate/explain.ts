// ---- kind: explain ----------------------------------------------------------
// A model explanation of one concept, as five cards, and one check: a listener
// voices the typical misconception and the learner picks the reply that
// defuses it. Exactly one reply does — the same rule as Feynman's fix replies
// (`validateFeynmanBeat`), for the same reason: a check with two right answers
// marks a right learner wrong.

import {
  type Boundary,
  arr,
  boundaryNote,
  fail,
  interestNote,
  languageNote,
  lensNote,
  obj,
  rejectEcho,
  str,
  user,
} from "./common";
import type { Cell, Domain, ExplainContent, NodeKind } from "@/lib/curriculum";
import { Language } from "@/lib/i18n";
import { generateJson } from "@/lib/server/openrouter";

export const EXPLAIN_ORDER_BOUNDS = { min: 3, max: 5 } as const;

export function validateExplain(nodeId: string, nodeLabel: string) {
  return (raw: unknown): ExplainContent => {
    const root = obj(raw, "payload");
    const field = (o: Record<string, unknown>, key: string, at: string) =>
      rejectEcho(str(o[key], `${at}.${key}`), `${at}.${key}`);
    const analogy = obj(root.analogy, "analogy");
    const misconception = obj(root.misconception, "misconception");
    const checkBack = obj(root.checkBack, "checkBack");
    const listener = obj(root.listener, "listener");
    const replies = arr(listener.replies, "listener.replies", 2, 3).map((r, i) => {
      const rep = obj(r, `listener.replies[${i}]`);
      return {
        label: field(rep, "label", `listener.replies[${i}]`),
        correct: rep.correct === true,
        why: field(rep, "why", `listener.replies[${i}]`),
      };
    });
    if (replies.filter((r) => r.correct).length !== 1)
      fail("listener.replies needs exactly one correct reply and at least one incorrect");
    // The model puts the right reply where the example did. Rotate by the node
    // id so its position varies but a cached row stays the same row.
    const shift = [...nodeId].reduce((a, c) => a + c.charCodeAt(0), 0) % replies.length;
    replies.push(...replies.splice(0, shift));
    return {
      nodeId,
      nodeLabel,
      problem: rejectEcho(str(root.problem, "problem"), "problem"),
      analogy: {
        text: field(analogy, "text", "analogy"),
        breaks: field(analogy, "breaks", "analogy"),
      },
      order: arr(
        root.order,
        "order",
        EXPLAIN_ORDER_BOUNDS.min,
        EXPLAIN_ORDER_BOUNDS.max,
      ).map((o, i) => rejectEcho(str(o, `order[${i}]`), `order[${i}]`)),
      misconception: {
        belief: field(misconception, "belief", "misconception"),
        tempting: field(misconception, "tempting", "misconception"),
      },
      checkBack: {
        question: field(checkBack, "question", "checkBack"),
        rightAnswer: field(checkBack, "rightAnswer", "checkBack"),
      },
      listener: { says: field(listener, "says", "listener"), replies },
    };
  };
}

export interface ExplainParams extends Boundary {
  topic: string;
  nodeId: string;
  nodeLabel: string;
  interests: string;
  language?: Language;
  nodeKind?: NodeKind;
  domain?: Domain;
  /** The node's cell; server-stamped, never from a client. */
  cell?: Cell;
}

export async function generateExplain(params: ExplainParams): Promise<ExplainContent> {
  const { topic, nodeLabel, interests, language = "en" } = params;
  return generateJson(
    user(
      `The learner has just read about the concept "${nodeLabel}" within "${topic}". Now show them HOW TO EXPLAIN it to someone who has never heard of it: a model explanation, broken into its moves, and one check of whether they can spot the reply that actually clears up a listener's confusion.
${interestNote(interests)}
${boundaryNote(params)}${lensNote(params)}
The "order" lists only ideas THIS concept introduces: a concept the map already taught is something the listener can be reminded of in passing, never re-taught, and a concept the map teaches later is never explained here.

Return JSON:
{
  "problem": "the question or problem this concept answers, in one or two sentences — where a good explanation starts, before any definition",
  "analogy": { "text": "one concrete analogy that carries the core of it", "breaks": "where the analogy stops being true, and what a listener would wrongly conclude if they pushed it too far" },
  "order": ["${EXPLAIN_ORDER_BOUNDS.min}-${EXPLAIN_ORDER_BOUNDS.max} short ideas, in the order to introduce them; each one should only need the ones before it"],
  "misconception": { "belief": "the typical wrong idea a listener forms, stated as they would believe it", "tempting": "why it is tempting — what true thing it grows out of" },
  "checkBack": { "question": "one question to ask the listener to check they got it — not 'does that make sense?'", "rightAnswer": "what a right answer contains" },
  "listener": {
    "says": "the listener, voicing that misconception in their own words, as one or two natural sentences",
    "replies": [
      { "label": "a reply the learner could give, in a sentence or two", "correct": true, "why": "why it works: what it says that dissolves the misconception" },
      { "label": "a plausible reply that does NOT defuse it — e.g. repeating the definition louder, or correcting a side detail", "correct": false, "why": "why it leaves the misconception standing" },
      { "label": "another plausible reply that fails for a different reason", "correct": false, "why": "why it fails" }
    ]
  }
}
Exactly ONE reply is correct. The wrong ones must be things a well-meaning explainer really says, not strawmen, and the right one must not be the longest or the only one that sounds technical. Vary its position.${languageNote(language)}`,
    ),
    validateExplain(params.nodeId, nodeLabel),
    { label: "explain" },
  );
}
