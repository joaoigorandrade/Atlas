// Cards, stored by topic — one row each.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/server/store/shared";
import { gradeStoredCard, type StoredCard } from "@/lib/fsrs";
import type { ReviewGrade } from "@/lib/curriculum";
import { CARD_COLUMNS, type CardRow, toCard } from "@/lib/server/store/topics";

// ------------------------------------------------------------------ cards --

/**
 * Just the deck. The review route used to call `loadTopic`, which fires four
 * queries and rebuilds the whole graph — nodes, edges, positions, states and
 * five progress maps — to read one field off the end of it. On the largest map
 * in production that is ~187 node rows and ~278 edge rows fetched and
 * object-built per deck open, then thrown away, on the phone's hot path.
 *
 * No `due <=` filter on purpose: the forecast is computed over the whole deck,
 * so narrowing here would change what the learner is shown, not just what is
 * read.
 */
export async function loadCards(
  db: SupabaseClient,
  topicId: string,
): Promise<StoredCard[]> {
  const { data, error } = await db
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("topic_id", topicId);
  if (error) fail("loadCards", error);
  return ((data ?? []) as CardRow[]).map(toCard);
}

const cardRow = (userId: string, topicId: string, card: StoredCard) => {
  const { id, nodeId, type, source, fsrs, ...content } = card;
  return {
    topic_id: topicId,
    id,
    user_id: userId,
    node_id: nodeId,
    type,
    source,
    content,
    fsrs,
    due: fsrs.due,
  };
};

/**
 * Write cards. One graded card is one row — the deck used to be re-serialized
 * and re-uploaded in full on every grade, which is what
 * `docs/ios-audit/06-review-calibration.md` flagged as the scaling problem.
 *
 * Upsert on the card's own id so a phase redone (Connect re-confirming the same
 * link) rewrites in place instead of stacking a duplicate with a fresh
 * scheduler state.
 */
export async function putCards(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  cards: StoredCard[],
): Promise<void> {
  if (cards.length === 0) return;
  const { error } = await db.from("cards").upsert(
    cards.map((c) => cardRow(userId, topicId, c)),
    { onConflict: "topic_id,id" },
  );
  if (error) fail("putCards", error);
}

/** Grade one card through the real scheduler and store the result.
 *
 *  The scheduling itself is `gradeStoredCard` in lib/fsrs.ts — the same
 *  function the browser calls locally. That is what makes the two clients
 *  agree on a due date: not a second implementation kept in step by hand, but
 *  one implementation reached two ways. */
export async function gradeCard(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  cardId: string,
  grade: ReviewGrade,
  now: Date = new Date(),
): Promise<StoredCard | null> {
  const { data, error } = await db
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("topic_id", topicId)
    .eq("id", cardId)
    .maybeSingle();
  if (error) fail("gradeCard", error);
  if (!data) return null;
  const next = gradeStoredCard(toCard(data as CardRow), grade, now);
  await putCards(db, userId, topicId, [next]);
  return next;
}

export async function deleteCards(
  db: SupabaseClient,
  topicId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db.from("cards").delete().eq("topic_id", topicId).in("id", ids);
  if (error) fail("deleteCards", error);
}
