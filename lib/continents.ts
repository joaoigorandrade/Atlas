// Continents on the wire: maps that belong together.
//
// A continent is a name, the scope offers a too-broad build came back with,
// and the topics that point at it. It travels *inside* each member topic
// (`Topic.continent`), so the library the bootstrap already returns is the
// whole picture — the client groups `maps` by it and asks for nothing else.
// Membership is a topic field (`patchTopic(id, { continentId })`); these are
// the three things only the continent itself can do.

import { call } from "@/lib/persistence";
import { post } from "@/lib/api";
import type { ScopeOffer } from "@/lib/api";

export interface Continent {
  id: string;
  name: string;
  /** Every scope a too-broad build offered. One is *uncharted* while no
   *  member topic carries its subject — derived, never stored. */
  scopes: ScopeOffer[];
}

export function createContinent(body: {
  name: string;
  scopes?: ScopeOffer[];
  topicIds: string[];
}): Promise<Continent> {
  return call("createContinent", "/continents", { method: "POST", body });
}

export function renameContinent(id: string, name: string): Promise<void> {
  return call("renameContinent", `/continents/${id}`, {
    method: "PATCH",
    body: { name },
  });
}

/** Dissolve it. The maps stay — `on delete set null` just lets them go. */
export function deleteContinent(id: string): Promise<void> {
  return call("deleteContinent", `/continents/${id}`, { method: "DELETE" });
}

/**
 * Which of these maps share material, as pairs of subjects — the judgement
 * behind which countries share a coast. A generation like any other, so the
 * same set of maps is answered from the shared cache after the first time.
 */
export async function fetchContinentLinks(
  maps: { subject: string; labels: string[] }[],
): Promise<[string, string][]> {
  const { links } = await post<{ links: [string, string][] }>({
    kind: "continentLinks",
    topic: "continent",
    maps,
  });
  return links;
}
