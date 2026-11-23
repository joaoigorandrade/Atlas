// Cards, stored by topic — one row each.
//
// PUT upserts a batch of card content (a phase minting new cards, or a redone
// phase rewording its own); PATCH suspends or restores; DELETE removes by id.
// Scheduler state is the server's: a card new to the store starts from the
// state it was minted with, and from then on only a grade (`/review`) moves it.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { deleteCards, ownsTopic, putCards, setSuspended } from "@/lib/server/store";
import { cardProblem } from "@/lib/server/cardShape";
import { withSchedule, type StoredCard } from "@/lib/fsrs";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

type Params = { params: Promise<{ id: string }> };

const MAX_CARDS = 200;

export async function PUT(request: Request, { params }: Params) {
  const who = await caller("cards");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{ cards?: StoredCard[] }>(request);
  const cards = Array.isArray(body?.cards) ? body.cards : null;
  if (!cards) return apiError("invalid", { requestId: who.requestId, reason: "cards" });
  if (cards.length > MAX_CARDS)
    return apiError("invalid", { requestId: who.requestId, reason: "too_many" });
  const problem = cards.map(cardProblem).find((p) => p !== null);
  if (problem) return apiError("invalid", { requestId: who.requestId, reason: problem });
  // A card minted by a client that does not run the scheduler arrives without
  // one, and `due` is not nullable — rejecting the batch dropped every card the
  // phone ever drafted on the floor. The scheduler lives here, so it starts here.
  const filled = withSchedule(cards);

  try {
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    await putCards(who.db, who.userId, id, filled);
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("cards_put_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const who = await caller("cards");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{ ids?: string[] }>(request);
  const ids = Array.isArray(body?.ids) ? body.ids : null;
  if (!ids) return apiError("invalid", { requestId: who.requestId, reason: "ids" });
  try {
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    await deleteCards(who.db, id, ids.slice(0, MAX_CARDS));
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("cards_delete_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}

/** Suspend cards, or put them back in rotation — `{ ids, suspended }`. */
export async function PATCH(request: Request, { params }: Params) {
  const who = await caller("cards");
  if (isResponse(who)) return who;
  const { id } = await params;
  const body = await jsonBody<{ ids?: unknown; suspended?: unknown }>(request);
  const ids =
    Array.isArray(body?.ids) && body.ids.every((v) => typeof v === "string")
      ? (body.ids as string[])
      : null;
  if (!ids || typeof body?.suspended !== "boolean")
    return apiError("invalid", { requestId: who.requestId, reason: "suspend" });
  try {
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    await setSuspended(who.db, id, ids.slice(0, MAX_CARDS), body.suspended);
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("cards_suspend_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
