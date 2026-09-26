// ---- kind: continentLinks ---------------------------------------------------
// Which maps of a continent genuinely belong together.
//
// A learner may put any maps in one continent — a theology map beside a map of
// dark humour — and grouping them says nothing about whether one leans on the
// other. The continent screen draws related maps as one landmass and the rest
// as islands across open sea, so the coast between two countries is a claim
// that they share material. This is the judgement behind that claim: strict,
// pairwise, and cached like any other generation, so one set of maps is judged
// once however many times the continent is opened.

import { arr, fail, obj, user } from "./common";
import { generateJson } from "@/lib/server/openrouter";
import { badRequest, CAPS, labels, s, type GenerateBody } from "@/lib/server/jobInput";

export interface ContinentLinksParams {
  /** Required of every request; the prompt ignores it, so a renamed
   *  continent keeps its cached answer. */
  topic: string;
  maps: { subject: string; labels: string[] }[];
}

/**
 * The request, normalized so the key is order-free: the same maps, listed in
 * any order, address one row. Capped like every other input.
 */
export function continentLinksParams(
  body: GenerateBody,
  topic: string,
): ContinentLinksParams {
  const maps = (Array.isArray(body.maps) ? body.maps : [])
    .slice(0, 12)
    .map((m: { subject?: unknown; labels?: unknown }) => ({
      subject: s(m?.subject).trim().slice(0, CAPS.topic),
      labels: labels(m?.labels, 40),
    }))
    .filter((m) => m.subject)
    .sort((a, b) => a.subject.localeCompare(b.subject));
  if (maps.length < 2) throw badRequest("continentLinks needs at least two maps");
  return { topic, maps };
}

/** Every pair the model named, each once, as `[low, high]` map indices. */
export function validateContinentLinks(raw: unknown, count: number): [number, number][] {
  const seen = new Set<string>();
  const links: [number, number][] = [];
  for (const pair of arr(obj(raw, "payload").links, "links", 0, 200)) {
    if (!Array.isArray(pair) || pair.length !== 2) fail("each link is a pair [i, j]");
    const [a, b] = (pair as unknown[]).map(Number);
    if (![a, b].every((i) => Number.isInteger(i) && i >= 0 && i < count) || a === b)
      fail(`link indices must be two different map numbers from 0 to ${count - 1}`);
    const key = `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    links.push([Math.min(a, b), Math.max(a, b)]);
  }
  return links;
}

/** The connected pairs, by subject — the client matches maps by name, so the
 *  answer never depends on the order either side listed them in. */
export async function generateContinentLinks(
  params: ContinentLinksParams,
): Promise<[string, string][]> {
  const list = params.maps
    .map(
      (m, i) => `${i}. "${m.subject}" — concepts: ${m.labels.join(", ") || "(none yet)"}`,
    )
    .join("\n");
  const links = await generateJson(
    user(
      `A learner has grouped these concept maps into one collection. Decide which PAIRS of maps are genuinely connected.

${list}

Two maps are connected when a learner would actually carry knowledge from one into the other: one builds on the other's concepts, or they teach overlapping ideas, methods or sources. Being in the same collection, or both being "school subjects", is NOT a connection. Be strict — a map about a religious figure and a map about a style of comedy share nothing, and must not be linked.

Return JSON, using the map numbers above, and an empty list when no two maps are connected:
{"links": [[0, 1], ...]}`,
    ),
    (raw) => validateContinentLinks(raw, params.maps.length),
    { label: "continent-links" },
  );
  return links.map(([a, b]) => [params.maps[a].subject, params.maps[b].subject]);
}

/** The job's payload — what the continent screen reads. */
export const linksPayload = async (params: ContinentLinksParams) => ({
  links: await generateContinentLinks(params),
});
