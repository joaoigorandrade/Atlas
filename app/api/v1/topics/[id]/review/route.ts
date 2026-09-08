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
import { retainContentFromStore } from "@/lib/fsrs";
import { gradeCard, loadTopic, ownsTopic } from "@/lib/server/store";
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
  const lang = (url.searchParams.get("lang") as Language | null) ?? "en";
  try {
    const topic = await loadTopic(who.db, id);
    if (!topic) return apiError("notfound", { requestId: who.requestId });
    return withRequestId(
      NextResponse.json(retainContentFromStore(topic.cards, budgetMin, new Date(), lang)),
      who.requestId,
    );
  } catch (err) {
    logError("review_read_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}

export async function POST(request: Request, { params }: Params) {
  const who = await caller("review");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{ cardId?: string; grade?: ReviewGrade }>(request);
  if (!body?.cardId || !GRADES.includes(body.grade as ReviewGrade))
    return apiError("invalid", { requestId: who.requestId, reason: "grade" });
  try {
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    const card = await gradeCard(
      who.db,
      who.userId,
      id,
      body.cardId,
      body.grade as ReviewGrade,
    );
    // A card the deck has but the store doesn't is a stale queue, not a bad
    // request — the client drops it and moves on.
    if (!card) return apiError("notfound", { requestId: who.requestId });
    return withRequestId(NextResponse.json({ card }), who.requestId);
  } catch (err) {
    logError("grade_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
