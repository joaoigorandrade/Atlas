// ---- the map's grounding and its shape check --------------------------------
// Split from `map.ts` (W2.3): what the map is built against when the learner
// uploaded nothing, and the one whole-map shape the logs count.

import { arr, languageNote, obj, str, user } from "./common";
import type { MapParams } from "./mapPrompt";
import type { MapNode } from "@/lib/curriculum";
import { logEvent } from "@/lib/log";
import { generateJson } from "@/lib/server/openrouter";

/**
 * W2.3: an exam map with no uploaded syllabus used to be the model's memory of
 * the topic, and linear algebra came back without the inverse. One fast call
 * lists the standard course's units first; the map is grounded in that list
 * through the same `outline` path an upload takes. Best-effort: a failed call
 * builds the map as it always did.
 */
// A named chapter is grounded whatever the goal: left to memory, a Pareto map
// of Nilsson's chapter 2 kept chapter 1's power and dropped Kirchhoff's laws.
// ponytail: catches "capítulo 2", "Ch. 3", "aula 5"; anything else falls back to the prompt rule.
export const PART_OF_WORK =
  /\b(cap[ií]tulo|cap|chapter|ch|se[cç][aã]o|section|unidade|unit|aula|lecture|li[cç][aã]o|lesson)\.?\s*\d+/i;

export async function withSyllabus(params: MapParams): Promise<MapParams> {
  const part = PART_OF_WORK.test(params.topic);
  if ((params.goal !== "exam" && !part) || params.outline?.trim() || params.scoped)
    return params;
  // Asked as "the standard course", a named chapter came back as another
  // textbook's chapter of the same number — Sadiku's "Leis básicas" for Nilsson.
  const ask = part
    ? `"${params.topic}" names one part of a larger work. List the sections of THAT part exactly as that work lays them out, in its own order — if a book or author is named, that book's own sections, never another textbook's part of the same number. The first unit opens with the part's title. Never list the rest of the work. Reply with JSON: {"units": ["section — its key subtopics", ...]} (4-10 units).`
    : `List the units of the standard university or exam-board course on "${params.topic}", in teaching order — what its syllabus actually covers and an exam actually tests, including the topics usually forgotten in a quick summary. Reply with JSON: {"units": ["unit — its key subtopics", ...]} (8-16 units). If "${params.topic}" names ONE PART of a larger work, list only the sections of THAT part (4-10 units), never the rest of the work.`;
  try {
    const units = await generateJson(
      user(`${ask}${languageNote(params.language ?? "en")}`),
      (r) =>
        arr(obj(r, "payload").units, "units", 4, 24).map((u, i) => str(u, `units[${i}]`)),
      { label: "curriculum-syllabus" },
    );
    return { ...params, outline: units.map((u, i) => `${i + 1}. ${u}`).join("\n") };
  } catch {
    return params;
  }
}

/** W2.3: a >8-node map of width 1 is a chain — "came earlier" read as
 *  "is needed for". Logged so the panel and the logs can count them. */
export function noteChain(nodes: MapNode[], topic: string) {
  const width = Math.max(
    ...Object.values(
      nodes.reduce<Record<number, number>>(
        (m, n) => ((m[n.g] = (m[n.g] ?? 0) + 1), m),
        {},
      ),
    ),
  );
  if (nodes.length > 8 && width === 1)
    logEvent("map_chain", { topic, nodes: nodes.length });
}
