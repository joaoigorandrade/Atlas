"use client";

// Continents: the learner's maps grouped into the ones that belong together.
//
// Nothing here is stored of its own. A continent arrives inside each member
// topic (`Topic.continent`), so the list is `maps` grouped, and every write is
// one call followed by `refreshMaps()` — the library is a few hundred rows and
// one request. ponytail: refresh-after-write; go optimistic if the wait shows.

import { useCallback, useMemo, useState } from "react";
import { patchTopic } from "@/lib/persistence";
import { createContinent, deleteContinent, renameContinent } from "@/lib/continents";
import type { ScopeOffer } from "@/lib/api";
import type { ErrorContext } from "@/lib/errorCopy";
import type { RunState } from "@/components/atlas/useRunState";
import type { Screen } from "@/components/atlas/screen";
import type { ContinentMember } from "@/components/map/continentLayout";

export interface ContinentView {
  id: string;
  name: string;
  members: (ContinentMember & { masteryPct: number })[];
  /** Scopes offered when the continent was charted that no member covers yet. */
  uncharted: ScopeOffer[];
}

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export function useContinents(
  run: RunState,
  deps: {
    scopes: ScopeOffer[] | null;
    pickScope: (label: string, continentId?: string | null) => void;
    setScreen: (s: Screen) => void;
    showError: (err: unknown, opts?: { context?: ErrorContext }) => void;
  },
) {
  const { maps, topicId, graph, states, positions, form, refreshMaps, switchMap } = run;
  const { scopes, pickScope, setScreen, showError } = deps;
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const continents = useMemo<ContinentView[]>(() => {
    const by = new Map<string, ContinentView & { scopes: ScopeOffer[] }>();
    for (const t of maps) {
      if (!t.continent) continue;
      const c = by.get(t.continent.id) ?? { ...t.continent, members: [], uncharted: [] };
      by.set(c.id, c);
      // The live run's numbers move mid-session, before any save lands.
      const live = t.id === topicId;
      const m = {
        id: t.id,
        subject: t.subject,
        graph: live ? graph : t.graph,
        states: live ? states : t.states,
        positions: live ? positions : t.positions,
      };
      const mastered = m.graph.nodes.filter((n) => m.states[n.id] === "mastered").length;
      const total = m.graph.nodes.length;
      c.members.push({
        ...m,
        masteryPct: total ? Math.round((mastered / total) * 100) : 0,
      });
    }
    for (const c of by.values())
      c.uncharted = c.scopes.filter(
        (s) => !c.members.some((m) => same(m.subject, s.label)),
      );
    return [...by.values()]
      .map(({ scopes: _all, ...c }) => c)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [maps, topicId, graph, states, positions]);

  /** Maps in no continent — what "New continent" and "Add a map" choose from. */
  const loose = useMemo(
    () => maps.filter((t) => !t.continent).map((t) => ({ id: t.id, subject: t.subject })),
    [maps],
  );

  const write = useCallback(
    async (op: () => Promise<unknown>) => {
      setBusy(true);
      try {
        await op();
        refreshMaps();
      } catch (err) {
        showError(err, { context: "continent" });
      } finally {
        setBusy(false);
      }
    },
    [refreshMaps, showError],
  );

  const open = useCallback(
    (id: string) => {
      setOpenId(id);
      // A scope charted since the bootstrap is a topic the library hasn't seen.
      refreshMaps();
      setScreen("continent");
    },
    [refreshMaps, setScreen],
  );

  return {
    continents,
    loose,
    busy,
    open: continents.find((c) => c.id === openId) ?? null,
    openContinent: open,
    create: (name: string, topicIds: string[]) =>
      void write(() => createContinent({ name, topicIds })),
    rename: (id: string, name: string) => void write(() => renameContinent(id, name)),
    dissolve: (id: string) =>
      void write(async () => {
        await deleteContinent(id);
        setScreen("dashboard");
      }),
    join: (continentId: string, id: string) =>
      write(() => patchTopic(id, { continentId })),
    leave: (id: string) => void write(() => patchTopic(id, { continentId: null })),
    enterMap: switchMap,
    /** Build one uncharted scope into its continent — onboarding's own path. */
    chart: (continentId: string, label: string) => pickScope(label, continentId),
    /** Every offer of a too-broad topic as one continent: build the first now,
     *  and leave the rest as uncharted land to chart from the continent. */
    chartAll: () => {
      if (!scopes?.length) return;
      void write(async () => {
        const c = await createContinent({
          name: form.topic.trim(),
          scopes,
          topicIds: [],
        });
        pickScope(scopes[0].label, c.id);
      });
    },
    exit: () => setScreen("dashboard"),
  };
}

export type Continents = ReturnType<typeof useContinents>;
