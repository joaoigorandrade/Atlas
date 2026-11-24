// ---- kind: explain ----------------------------------------------------------
// A model explanation of one concept, as five cards, and one check: a listener
// voices the typical misconception and the learner picks the reply that
// defuses it. Exactly one reply does — the same rule as Feynman's fix replies
// (`validateFeynmanBeat`), for the same reason: a check with two right answers
// marks a right learner wrong.

import { cellNote } from "./cellNote";
import {
  type Boundary,
  arr,
  boundaryNote,
  domainNote,
  fail,
  filled,
  interestNote,
  kindNote,
  languageNote,
  lensNote,
  obj,
  rejectEcho,
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
      rejectEcho(filled(o[key], `${at}.${key}`), `${at}.${key}`);
    const analogy = obj(root.analogy, "analogy");
    const misconception = obj(root.misconception, "misconception");
    const checkBack = obj(root.checkBack, "checkBack");
    const listener = obj(root.listener, "listener");
    const replies = arr(listener.replies, "listener.replies", 2, 3).map((r, i) => {
      const rep = obj(r, `listener.replies[${i}]`);
      const label = field(rep, "label", `listener.replies[${i}]`);
      // Prod served "Resposta correta" / "Termo técnico" as the options: the
      // model named each reply's role instead of writing the reply.
      if (label.trim().split(/\s+/).length < 4)
        fail(`listener.replies[${i}].label must be the reply itself, not a name for it`);
      return {
        label,
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
      problem: rejectEcho(filled(root.problem, "problem"), "problem"),
      analogy: {
        text: field(analogy, "text", "analogy"),
        breaks: field(analogy, "breaks", "analogy"),
      },
      order: arr(
        root.order,
        "order",
        EXPLAIN_ORDER_BOUNDS.min,
        EXPLAIN_ORDER_BOUNDS.max,
      ).map((o, i) => rejectEcho(filled(o, `order[${i}]`), `order[${i}]`)),
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

/**
 * The prompt is built around what this phase is FOR: it is the one worked
 * example of an explanation the learner sees before Feynman asks them to give
 * one from a blank page. So the cards are short (a model to hold in mind, not
 * a second reading), the check is one thread with the cards (the listener
 * voices the very misconception card four named, and the right reply uses a
 * move the cards modelled), and every wrong reply fails for a NAMED reason, so
 * the learner leaves with a principle of explaining rather than one answer.
 */
export async function generateExplain(params: ExplainParams): Promise<ExplainContent> {
  const { topic, nodeLabel, interests, language = "en" } = params;
  return generateJson(
    user(
      `The learner has just finished the reading on "${nodeLabel}" within "${topic}". Now show them HOW TO EXPLAIN it to someone who has never heard of it: a worked example of a good explanation, broken into its moves, and then one check of whether they can pick the reply that actually clears up a listener's confusion. Later they will explain the concept themselves, from a blank page; this is the model they will have seen.

THE FIVE CARDS are shown one at a time, in this order. Keep each to 1-3 sentences — a model they can hold in mind, not a second reading.
- "problem": the question or problem this concept answers. A good explanation starts here, before any definition.
- "analogy": "text" is one concrete analogy that carries the core of it; "breaks" is where it stops being true, and what a listener would wrongly conclude if they pushed it too far. ${interestNote(interests)}
- "order": ${EXPLAIN_ORDER_BOUNDS.min}-${EXPLAIN_ORDER_BOUNDS.max} short ideas, in the order to introduce them, each needing only the ones before it. Only ideas THIS concept introduces: a concept the map already taught is mentioned in passing, never re-taught, and one the map teaches later is never explained.
- "misconception": "belief" is the typical wrong idea a listener forms, stated the way they would believe it; "tempting" is the true thing it grows out of.
- "checkBack": "question" makes the listener USE the idea on a case they have not heard — never "does that make sense?" and never "can you repeat it?"; "rightAnswer" is what a right answer contains.

THE CHECK. "listener.says" voices exactly the "belief" above, in one or two natural sentences of their own. Then write 3 replies the learner could give back. Each "label" IS the reply, word for word, as the learner would say it to the listener (one full sentence) — never a name for the kind of reply ("correct answer", "technical term", "Reply 1"):
- exactly one is correct: it goes after the tempting root of the belief, not only its conclusion, using a move the cards modelled — the analogy and where it breaks, the order, or a case where the belief fails;
- the other two are replies a well-meaning explainer really gives that leave the belief standing, each failing for a different reason — restating the definition louder, correcting a side detail, appealing to authority ("that's just how it works"), or leaning on a term the listener does not have.
Each "why" names the move that works or fails, in one sentence, so the learner leaves with a principle of explaining, not only this answer. All three replies are within a few words of the same length; the right one is never the longest, the most hedged, or the only one that sounds technical.
${boundaryNote(params)}${lensNote(params)}${kindNote(params.nodeKind, "explain")}${domainNote(params.domain, "explain")}${cellNote(params.cell, "explain")}
Where a note about this concept's kind, domain or weight differs from the rules above, the note wins.

Return JSON:
{
  "problem": "…",
  "analogy": { "text": "…", "breaks": "…" },
  "order": ["…", "…", "…"],
  "misconception": { "belief": "…", "tempting": "…" },
  "checkBack": { "question": "…", "rightAnswer": "…" },
  "listener": {
    "says": "…",
    "replies": [
      { "label": "…", "correct": true, "why": "…" },
      { "label": "…", "correct": false, "why": "…" },
      { "label": "…", "correct": false, "why": "…" }
    ]
  }
}
The replies are reordered after you write them, so their order carries no information.${languageNote(language)}`,
    ),
    validateExplain(params.nodeId, nodeLabel),
    { label: "explain" },
  );
}
