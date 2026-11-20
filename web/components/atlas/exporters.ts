// Data export (#32) — the map and the review deck, as files the learner keeps.
// Plain functions: nothing here touches React state.

import type { ConceptGraph, StateMap } from "@/lib/curriculum";
import type { StoredCard } from "@/lib/fsrs";

function download(name: string, text: string, mime: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = name;
  a.click();
  URL.revokeObjectURL(a.href);
}

const slug = (topic: string) =>
  (topic.trim() || "atlas").toLowerCase().replace(/\W+/g, "-");

export function exportMap(topic: string, graph: ConceptGraph, states: StateMap) {
  download(
    `${slug(topic)}-map.json`,
    JSON.stringify({ topic, nodes: graph.nodes, edges: graph.edges, states }, null, 2),
    "application/json",
  );
}

export function exportCardsJson(topic: string, cards: StoredCard[]) {
  download(
    `${slug(topic)}-cards.json`,
    JSON.stringify(cards, null, 2),
    "application/json",
  );
}

export function exportCardsCsv(topic: string, cards: StoredCard[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const rows = cards.map((c) => {
    const front = c.front ?? (c.cloze ? `${c.cloze[0]}____${c.cloze[1]}` : "");
    return `${esc(front)},${esc(c.back)}`;
  });
  download(`${slug(topic)}-cards.csv`, rows.join("\n"), "text/csv");
}
