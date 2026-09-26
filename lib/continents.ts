// Continents on the wire: maps that belong together.
//
// A continent is a name, the scope offers a too-broad build came back with,
// and the topics that point at it. It travels *inside* each member topic
// (`Topic.continent`), so the library the bootstrap already returns is the
// whole picture — the client groups `maps` by it and asks for nothing else.
// Membership is a topic field (`patchTopic(id, { continentId })`); these are
// the three things only the continent itself can do.

import { call } from "@/lib/persistence";
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
