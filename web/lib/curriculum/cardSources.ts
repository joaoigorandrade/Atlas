// Which cards are the Retain factory's own. A leaf on purpose — no imports —
// because `adherence` reads it and the colour modules sit above that.

/** The sources whose cards are not the factory's. Connect cards test a link
 *  between two nodes and Drill cards a leftover call; neither asks for the node
 *  itself, so neither means the node has its own card. */
const PHASE_SOURCES = new Set(["Connect", "Drill"]);

/** Is this a card the Retain factory drafted — the one that asks for the node
 *  itself? Older factory cards carry whatever session the model attributed
 *  them to, so this is "not a phase's", not "equals Consume". */
export function isFactoryCard(card: { source: string }): boolean {
  return !PHASE_SOURCES.has(card.source);
}

/** Touched nodes still without a factory card of their own — what the next
 *  Retain draft is for. A node with only Connect or Drill cards still needs
 *  the card that asks for the node itself. */
export function uncoveredNodes<N extends { id: string }>(
  nodes: readonly N[],
  cards: ReadonlyArray<{ nodeId: string; source: string }>,
): N[] {
  const covered = new Set(cards.filter(isFactoryCard).map((c) => c.nodeId));
  return nodes.filter((n) => !covered.has(n.id));
}
