// Turning a Retain draft into stored cards. Pure — the hook decides when.

import { isFactoryCard, type RetainContent } from "@/lib/curriculum";
import { newStoredCard, type StoredCard } from "@/lib/fsrs";

/** How many further drafts one Review open runs behind the open queue. Each
 *  covers `RETAIN_DRAFT_NODES` nodes, so this is how many newly learned
 *  concepts get cards before the next open picks up the rest. */
export const MAX_BACKGROUND_DRAFTS = 4;

/**
 * The drafted cards worth filing, as brand-new scheduled cards.
 *
 * A node that gained a factory card while this draft was out (an earlier draft
 * landed, another device drafted one) keeps the one it has — filing these as
 * well would deal the same fact twice. Connect and Drill cards don't count:
 * they never ask for the node itself.
 */
export function seedDrafted(
  content: RetainContent,
  held: readonly StoredCard[],
  now: Date = new Date(),
): StoredCard[] {
  const covered = new Set(held.filter(isFactoryCard).map((c) => c.nodeId));
  const stamp = now.getTime();
  return content.cards
    .filter((c) => !covered.has(c.node))
    .map((c, i) =>
      newStoredCard(
        {
          id: `${c.node}-retain-${stamp}-${i}`,
          nodeId: c.node,
          type: c.type,
          source: c.source,
          cloze: c.cloze,
          answer: c.answer,
          front: c.front,
          back: c.back,
          reExplain: c.reExplain,
        },
        now,
      ),
    );
}

/** The cards the hook knows about: the store as last rendered, plus what this
 *  run of drafts has filed and React has not rendered yet. */
export function withFiled(
  store: readonly StoredCard[],
  filed: readonly StoredCard[],
): StoredCard[] {
  const ids = new Set(store.map((c) => c.id));
  return [...store, ...filed.filter((c) => !ids.has(c.id))];
}
