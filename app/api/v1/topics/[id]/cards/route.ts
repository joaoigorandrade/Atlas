// Cards, stored by topic — one row each.
//
// PUT upserts a batch (a phase minting new cards, or one graded card carrying
// its new scheduler state); DELETE removes by id. Grading used to re-serialize
// and re-upload the whole deck.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { deleteCards, ownsTopic, putCards } from "@/lib/server/store";
import type { StoredCard } from "@/lib/fsrs";
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
  // A card without scheduler state has no due date, and `due` is not nullable —
  // catch it here rather than as a Postgres constraint error.
  if (cards.some((c) => !c?.id || !c?.fsrs?.due))
    return apiError("invalid", { requestId: who.requestId, reason: "card_shape" });

  try {
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });
    await putCards(who.db, who.userId, id, cards);
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
    await deleteCards(who.db, id, ids.slice(0, MAX_CARDS));
    return withRequestId(NextResponse.json({ ok: true }), who.requestId);
  } catch (err) {
    logError("cards_delete_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
