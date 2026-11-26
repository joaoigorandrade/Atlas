// Cards, stored by topic — one row each.

import type { SupabaseClient } from "@supabase/supabase-js";
import { fail } from "@/lib/server/store/shared";
import { reviewStoredCard, type StoredCard } from "@/lib/fsrs";
import { logWarning } from "@/lib/log";
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

/** The fields only the server writes — a grade (`gradeCard`), an undo, or the
 *  suspend route. A client's card write never changes them on a card the
 *  store already holds. */
type ServerOwned = { fsrs: StoredCard["fsrs"]; suspended: boolean };

const cardRow = (
  userId: string,
  topicId: string,
  card: StoredCard,
  owned: ServerOwned,
) => {
  // The client's own `fsrs` and `suspended` are dropped here: `owned` decides.
  const { id, nodeId, type, source, fsrs: _fsrs, suspended: _sus, ...content } = card;
  return {
    topic_id: topicId,
    id,
    user_id: userId,
    node_id: nodeId,
    type,
    source,
    content,
    fsrs: owned.fsrs,
    due: owned.fsrs.due,
    suspended: owned.suspended,
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
 *
 * A card the store already holds keeps its own scheduler state and suspension:
 * those change only through a grade. Taking them from the client let a browser
 * tab loaded this morning write its stale copy over a review the phone made at
 * noon. A card new to the store starts from the state the client minted.
 */
export async function putCards(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  cards: StoredCard[],
): Promise<void> {
  if (cards.length === 0) return;
  const { data: held, error: readError } = await db
    .from("cards")
    .select("id, fsrs, suspended")
    .eq("topic_id", topicId)
    .in(
      "id",
      cards.map((c) => c.id),
    );
  if (readError) fail("putCards/read", readError);
  const owned = new Map(
    ((held ?? []) as Array<{ id: string } & Partial<ServerOwned>>).map((r) => [
      r.id,
      { fsrs: r.fsrs!, suspended: !!r.suspended },
    ]),
  );
  const { error } = await db.from("cards").upsert(
    cards.map((c) =>
      cardRow(userId, topicId, c, owned.get(c.id) ?? { fsrs: c.fsrs, suspended: false }),
    ),
    { onConflict: "topic_id,id" },
  );
  if (error) fail("putCards", error);
}

async function readCard(
  db: SupabaseClient,
  topicId: string,
  cardId: string,
): Promise<StoredCard | null> {
  const { data, error } = await db
    .from("cards")
    .select(CARD_COLUMNS)
    .eq("topic_id", topicId)
    .eq("id", cardId)
    .maybeSingle();
  if (error) fail("readCard", error);
  return data ? toCard(data as CardRow) : null;
}

/** Write the server-owned fields — only while the store still holds the copy
 *  the caller read (`reps`). False when another write got there first: two
 *  grades read at the same rep count both passed the old read-then-write, and
 *  the later one silently replaced the earlier. */
async function writeOwned(
  db: SupabaseClient,
  topicId: string,
  cardId: string,
  owned: ServerOwned,
  reps: number,
): Promise<boolean> {
  const { data, error } = await db
    .from("cards")
    .update({
      fsrs: owned.fsrs,
      due: owned.fsrs.due,
      suspended: owned.suspended,
      updated_at: new Date().toISOString(),
    })
    .eq("topic_id", topicId)
    .eq("id", cardId)
    .eq("fsrs->>reps", String(reps))
    .select("id");
  if (error) fail("writeOwned", error);
  return (data ?? []).length > 0;
}

export type GradeOutcome =
  | { kind: "graded"; card: StoredCard; leech: boolean }
  /** The client graded a copy older than the store's: someone (another
   *  device) reviewed it since. Nothing is written; this is the store's card. */
  | { kind: "conflict"; card: StoredCard };

/** Grade one card through the real scheduler, store the result, and log it.
 *
 *  The scheduling itself is `reviewStoredCard` in lib/fsrs.ts — the same
 *  function the browser calls for its optimistic copy. That is what makes the
 *  two clients agree on a due date: not a second implementation kept in step by
 *  hand, but one implementation reached two ways.
 *
 *  `expectReps` is the rep count of the copy the client graded. When the store
 *  has moved past it, the grade is refused rather than computed from a state
 *  the learner never saw. */
export async function gradeCard(
  db: SupabaseClient,
  userId: string,
  topicId: string,
  cardId: string,
  grade: ReviewGrade,
  opts: { now?: Date; durationMs?: number; expectReps?: number } = {},
): Promise<GradeOutcome | null> {
  const held = await readCard(db, topicId, cardId);
  if (!held) return null;
  const reps = held.fsrs.reps ?? 0;
  if (opts.expectReps !== undefined && reps !== opts.expectReps)
    return { kind: "conflict", card: held };
  const { card, review, leech } = reviewStoredCard(
    held,
    grade,
    opts.now ?? new Date(),
    opts.durationMs,
  );
  const swapped = await writeOwned(
    db,
    topicId,
    cardId,
    { fsrs: card.fsrs, suspended: !!card.suspended },
    reps,
  );
  // Another grade landed between our read and our write: it stands, and this
  // one is refused exactly as a stale `expectReps` is.
  if (!swapped) {
    const now = await readCard(db, topicId, cardId);
    return now ? { kind: "conflict", card: now } : null;
  }
  const { error } = await db.from("card_reviews").insert({
    topic_id: topicId,
    card_id: cardId,
    user_id: userId,
    rating: review.rating,
    reviewed_at: review.reviewedAt,
    duration_ms: review.durationMs ?? null,
    state: review.state,
    elapsed_days: review.elapsedDays,
    scheduled_days: review.scheduledDays,
    stability: review.stability,
    difficulty: review.difficulty,
    reps: review.reps,
    before: review.before,
  });
  // The grade stands without its log row: losing one review's history is a
  // smaller harm than telling the learner a grade they gave didn't count.
  if (error) logWarning("card_review_log_failed", error, { topicId, cardId });
  return { kind: "graded", card, leech };
}

/** Take back a card's latest review: its state before that review comes back
 *  and the log row goes. Null when the card has no logged review to undo. */
export async function undoGrade(
  db: SupabaseClient,
  topicId: string,
  cardId: string,
): Promise<StoredCard | null> {
  const held = await readCard(db, topicId, cardId);
  if (!held) return null;
  const { data, error } = await db
    .from("card_reviews")
    .select("reps, before")
    .eq("topic_id", topicId)
    .eq("card_id", cardId)
    .order("reps", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) fail("undoGrade/read", error);
  const last = data as { reps: number; before: ServerOwned } | null;
  // Only the review that produced the card's current state can be undone — a
  // log row behind it would restore a state from before a later review.
  if (!last || last.reps !== (held.fsrs.reps ?? 0)) return null;
  // The log row goes first, and only that row: a second undo racing this one
  // finds nothing to take. Were the card write below to fail after it, the
  // grade simply stands minus one log row — the old order (card first) left a
  // restored card under a log row it no longer matched.
  const { data: dropped, error: dropError } = await db
    .from("card_reviews")
    .delete()
    .eq("topic_id", topicId)
    .eq("card_id", cardId)
    .eq("reps", last.reps)
    .select("id");
  if (dropError) fail("undoGrade/delete", dropError);
  if (!(dropped ?? []).length) return null;
  if (!(await writeOwned(db, topicId, cardId, last.before, last.reps))) {
    // A grade slipped in between: it is the newer truth, so it stays.
    logWarning("undo_grade_lost_race", null, { topicId, cardId });
    return null;
  }
  return {
    ...held,
    fsrs: last.before.fsrs,
    suspended: last.before.suspended || undefined,
  };
}

/** Take cards out of rotation, or put them back. */
export async function setSuspended(
  db: SupabaseClient,
  topicId: string,
  ids: string[],
  suspended: boolean,
): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db
    .from("cards")
    .update({ suspended, updated_at: new Date().toISOString() })
    .eq("topic_id", topicId)
    .in("id", ids);
  if (error) fail("setSuspended", error);
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
