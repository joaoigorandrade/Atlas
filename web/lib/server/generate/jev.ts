// What Atlas asks Jev (`lib/server/decide.ts`) about content and maps rather
// than a learner's answer: blind-solving keys, the boundary of a cached
// Consume pass, a node's kind and cell, a new map's continent. Each returns
// what a *sure* answer settles and nothing otherwise, so every caller's
// fallback is the code it ran before.

import type { ConsumeChunk, GoalKind, MapNode } from "@/lib/curriculum";
import { sectionText } from "@/lib/curriculum";
import { clampCell } from "@/lib/curriculum/cells";
import { logEvent } from "@/lib/log";
import { choice, decide, noul, sureChoice, sureNoul, type Answer } from "../decide";
import { KIND_RULE } from "./mapPrompt";

// ---- 2. blind-solve verification --------------------------------------------

/** Jev's blind solve: per item, a pick with its calibrated probability and an
 *  "unstated" flag. Null when Jev is unavailable — the LLM solver runs then. */
export async function jevSolve(p: {
  topic: string;
  nodeLabel: string;
  context?: string;
  contextHidden?: boolean;
  items: Array<{ id: string; stem: string; options: string[] }>;
}): Promise<Record<
  string,
  { pick: number; confidence: number; unstated?: boolean }
> | null> {
  const a = await decide(
    {
      topic: p.topic,
      concept: p.nodeLabel,
      ...(p.context
        ? {
            [p.contextHidden ? "background_the_learner_does_not_see" : "shared_context"]:
              p.context,
          }
        : null),
    },
    Object.fromEntries(
      p.items.flatMap((it, n) => [
        [
          `pick_${n}`,
          choice(`Answer this item: ${it.stem}`, {
            ...Object.fromEntries(it.options.map((o, j) => [String(j), o])),
            none: "No option is right, or two are equally defensible.",
          }),
        ],
        [
          `unstated_${n}`,
          noul(
            `Item: ${it.stem}\nCould a learner NOT answer this from the item itself${p.context && !p.contextHidden ? " plus the shared context" : ""} and the concept — because it turns on a real-world value, spec, standard, date or name the item never states, or points at material it does not include ("in the example", "the text above")?`,
            "Yes: it leans on something it never states.",
            "No: it is answerable from what it states.",
          ),
        ],
      ]),
    ),
    "verify",
  );
  if (!a) return null;
  return Object.fromEntries(
    p.items.map((it, n) => {
      const pick = a[`pick_${n}`] as Extract<Answer, { type: "choice" }> | undefined;
      const unstated = sureNoul(a[`unstated_${n}`]) === true;
      const solved =
        pick?.type === "choice" && pick.choice !== "none"
          ? { pick: Number(pick.choice), confidence: pick.confidence }
          : { pick: -1, confidence: 0 };
      return [it.id, { ...solved, ...(unstated ? { unstated } : null) }];
    }),
  );
}

// ---- 8. overlap guard before caching ----------------------------------------

/** Does any Consume section confidently re-teach an earlier concept or explain
 *  a later one? Such a payload is shown but never shared through the cache. */
export async function overlapsBoundary(
  chunks: ConsumeChunk[],
  p: { nodeLabel?: string; priorLabels?: string[]; laterLabels?: string[] },
): Promise<boolean> {
  if (!p.priorLabels?.length && !p.laterLabels?.length) return false;
  const a = await decide(
    {
      concept: p.nodeLabel,
      already_taught_earlier: p.priorLabels ?? [],
      taught_later_by_their_own_lesson: p.laterLabels ?? [],
    },
    Object.fromEntries(
      chunks.map((c, i) => [
        `section_${i}`,
        noul(
          `Section of the lesson on "${p.nodeLabel}":\n${sectionText(c)}\n\nDoes this section RE-TEACH (re-explain or re-derive) a concept already taught earlier, or EXPLAIN (define, derive, work an example of) a concept taught later? Merely naming one in passing is fine.`,
          "Yes, it re-teaches an earlier concept or explains a later one.",
          "No, it stays inside its own concept.",
        ),
      ]),
    ),
    "overlap",
  );
  const flagged = chunks.filter((_, i) => sureNoul(a?.[`section_${i}`]) === true).length;
  if (flagged) logEvent("overlap_uncached", { node: p.nodeLabel, flagged });
  return flagged > 0;
}

/** A cached row reaches every later learner on this concept, so a Consume pass
 *  that crosses its boundary is shown to the learner who paid for it and never
 *  written to `content_cache`. Every other kind is always shareable. */
export const shareable = async (
  kind: string,
  p: { nodeLabel?: string; priorLabels?: string[]; laterLabels?: string[] },
  payload: Record<string, unknown>,
): Promise<boolean> =>
  kind !== "consume" ||
  !Array.isArray(payload.chunks) ||
  !(await overlapsBoundary(payload.chunks as ConsumeChunk[], p));

// ---- 9. node kind and cell backstop -----------------------------------------

const IMPORTANCE = {
  core: "The goal rests on it: a hub many others build on, or a capstone. Must be MASTERED.",
  working: "Must be USED to reach the core, not mastered: a tool, a stepping stone.",
  peripheral: "Context only to RECOGNISE: a term, a detail, a side branch.",
};
const DIFFICULTY = {
  easy: "Lands on first explanation for a newcomer who holds its prerequisites.",
  medium: "Neither easy nor one of the few that genuinely resist.",
  hard: "Genuinely resists: counter-intuitive, many moving parts, a classic stumbling block.",
};

/** Re-checks every node's kind and cell; a sure disagreement wins, and the
 *  cell is pulled back into the goal's allowed set as `clampCell` always does. */
export async function backstopAxes(
  nodes: MapNode[],
  p: { topic: string; goal?: GoalKind },
): Promise<MapNode[]> {
  const builtOn = (id: string) => nodes.filter((n) => n.prereqs.includes(id)).length;
  let changed = 0;
  const out = await Promise.all(
    nodes.map(async (n) => {
      const a = await decide(
        {
          topic: p.topic,
          learner_goal: p.goal ?? "mastery",
          concept: n.label,
          summary: n.summary,
          concepts_that_build_on_it: builtOn(n.id),
          map_size: nodes.length,
        },
        {
          kind: choice(KIND_RULE, {
            fact: "An arbitrary association: knowing it IS remembering it.",
            concept: "A class with defining attributes, members and non-members.",
            procedure: "An ordered sequence the learner carries out.",
            principle: "A causal relation or mechanism: predict what changes.",
          }),
          importance: choice(
            "How far must the learner take this concept, for this goal?",
            IMPORTANCE,
          ),
          difficulty: choice(
            "How hard is it for a newcomer who holds its prerequisites?",
            DIFFICULTY,
          ),
        },
        "map-axes",
      );
      const kind = (sureChoice(a?.kind) ?? n.kind) as MapNode["kind"];
      const importance = (sureChoice(a?.importance) ??
        n.importance) as MapNode["importance"];
      const difficulty = (sureChoice(a?.difficulty) ??
        n.difficulty) as MapNode["difficulty"];
      const cell =
        p.goal && importance && difficulty
          ? clampCell(p.goal, importance, difficulty)
          : { importance, difficulty };
      const next = { ...n, kind, ...cell };
      if (
        next.kind !== n.kind ||
        next.importance !== n.importance ||
        next.difficulty !== n.difficulty
      )
        changed++;
      return next;
    }),
  );
  if (changed)
    logEvent("map_axes_backstop", { topic: p.topic, changed, of: nodes.length });
  return out;
}

// ---- 10. continent placement ------------------------------------------------

/** Which of the learner's continents a new map belongs to, if Jev is sure. */
export async function placeInContinent(
  subject: string,
  interests: string,
  continents: Array<{ id: string; name: string; maps: string[] }>,
): Promise<string | undefined> {
  if (!continents.length) return undefined;
  const a = await decide(
    { new_map: subject, learner_interests: interests },
    {
      continent: choice(
        "A learner groups related maps into continents. Does the new map clearly belong with one of these, so a learner would carry knowledge between it and the maps there? Being school subjects, or merely in the same broad field, is not enough.",
        {
          ...Object.fromEntries(
            continents.map((c, i) => [
              String(i),
              `${c.name} — maps: ${c.maps.join(", ") || "(none yet)"}`,
            ]),
          ),
          none: "None: it does not clearly belong with any of them.",
        },
      ),
    },
    "continent-place",
  );
  const pick = sureChoice(a?.continent);
  return pick && pick !== "none" ? continents[Number(pick)]?.id : undefined;
}
