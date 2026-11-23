// Today's review deck, and the grade that answers it.
//
// The scheduler lives in one place — `lib/fsrs.ts`, on `ts-fsrs`. The browser
// calls it locally because it already ships it; the phone calls it through
// here. That is the whole parity story: not two implementations kept in step by
// hand (which is what the phone's SM-2 was, and why a card graded there showed
// a different due date in a browser), but one implementation reached two ways.
//
// GET answers with `RetainContent` — the exact shape both clients' Review
// screens already render, deck and forecast, with the real interval on every
// grade button. That is what lets the phone show honest intervals without
// carrying the algorithm: the numbers arrive with the cards.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { retainContentFromStore } from "@/lib/fsrsQueue";
import { gradeCard, loadCards, ownsTopic, undoGrade } from "@/lib/server/store";
import type { Language } from "@/lib/i18n";
import type { ReviewGrade } from "@/lib/curriculum";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

type Params = { params: Promise<{ id: string }> };

const GRADES: ReviewGrade[] = ["again", "hard", "good", "easy"];

export async function GET(request: Request, { params }: Params) {
  const who = await caller("review");
  if (isResponse(who)) return who;
  const { id } = await params;
  const url = new URL(request.url);
  // Clamped rather than trusted: the budget decides how many cards the deck
  // holds, and an unbounded one is an unbounded response.
  const budgetMin = Math.min(
    60,
    Math.max(1, Number(url.searchParams.get("budgetMin")) || 15),
  );
  // Checked, not cast: the copy is looked up by this, and an unknown value
  // used to throw on the lookup and answer 500.
  const asked = url.searchParams.get("lang");
  const lang: Language = asked === "pt-BR" ? "pt-BR" : "en";
  try {
    // The deck, not the whole topic: this route reads `cards` and nothing else.
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    const cards = await loadCards(who.db, id);
    return withRequestId(
      NextResponse.json(retainContentFromStore(cards, budgetMin, new Date(), lang)),
      who.requestId,
    );
  } catch (err) {
    logError("review_read_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}

/** How far back an offline grade may be dated. Older than this, the review
 *  is scheduled as of now: a week-old answer is still an answer, but a stale
 *  clock must not rewrite a card's history by months. */
const MAX_BACKDATE_MS = 7 * 86_400_000;
/** A client clock a little ahead of ours is a clock, not a time traveller. */
const MAX_SKEW_MS = 2 * 60_000;
/** Time on one card past which the measurement is a phone left on a table. */
const MAX_DURATION_MS = 10 * 60_000;

/** When the review happened: the client's own stamp when it is plausible —
 *  which is what makes the server's result match the browser's optimistic
 *  copy to the millisecond — and now otherwise. */
function reviewTime(stamp: unknown, now = Date.now()): Date {
  const at = typeof stamp === "string" ? Date.parse(stamp) : NaN;
  return Number.isFinite(at) && at <= now + MAX_SKEW_MS && at >= now - MAX_BACKDATE_MS
    ? new Date(Math.min(at, now))
    : new Date(now);
}

/**
 * Grade one card. The scheduler runs here for both clients, and the review is
 * logged (`card_reviews`). Optional fields, all ignored by an older client:
 *  - `reviewedAt` — when it was answered (an offline grade sent later);
 *  - `durationMs` — time on the card, for the log;
 *  - `expectReps` — the rep count of the copy that was graded. When the store
 *    has moved on (another device reviewed it), nothing is written and the
 *    answer is `{ card, conflict: true }` with the store's card.
 */
export async function POST(request: Request, { params }: Params) {
  const who = await caller("review");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{
    cardId?: string;
    grade?: ReviewGrade;
    reviewedAt?: unknown;
    durationMs?: unknown;
    expectReps?: unknown;
  }>(request);
  if (typeof body?.cardId !== "string" || !GRADES.includes(body.grade as ReviewGrade))
    return apiError("invalid", { requestId: who.requestId, reason: "grade" });
  const durationMs =
    typeof body.durationMs === "number" && Number.isFinite(body.durationMs)
      ? Math.round(Math.min(MAX_DURATION_MS, Math.max(0, body.durationMs)))
      : undefined;
  const expectReps =
    typeof body.expectReps === "number" && Number.isInteger(body.expectReps)
      ? body.expectReps
      : undefined;
  try {
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    const outcome = await gradeCard(
      who.db,
      who.userId,
      id,
      body.cardId,
      body.grade as ReviewGrade,
      { now: reviewTime(body.reviewedAt), durationMs, expectReps },
    );
    // A card the deck has but the store doesn't is a stale queue, not a bad
    // request — the client drops it and moves on.
    if (!outcome) return apiError("notfound", { requestId: who.requestId });
    return withRequestId(
      NextResponse.json(
        outcome.kind === "conflict"
          ? { card: outcome.card, conflict: true }
          : { card: outcome.card, leech: outcome.leech },
      ),
      who.requestId,
    );
  } catch (err) {
    logError("grade_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}

/** Undo a card's latest review — `{ cardId }`. Answers with the card as it
 *  stood before that review, or 404 when there is no review to take back. */
export async function DELETE(request: Request, { params }: Params) {
  const who = await caller("review");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{ cardId?: unknown }>(request);
  if (typeof body?.cardId !== "string")
    return apiError("invalid", { requestId: who.requestId, reason: "cardId" });
  try {
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    const card = await undoGrade(who.db, id, body.cardId);
    if (!card) return apiError("notfound", { requestId: who.requestId });
    return withRequestId(NextResponse.json({ card }), who.requestId);
  } catch (err) {
    logError("undo_grade_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
