// Create a continent: a name, the scope offers it was charted from (if any),
// and the maps that join it at once. Membership after that is a topic field.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import type { ScopeOffer } from "@/lib/api";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { createContinent, ownsTopic } from "@/lib/server/store";
import { caller, isResponse, jsonBody } from "@/lib/server/v1";

const str = (v: unknown, max: number) =>
  typeof v === "string" ? v.trim().slice(0, max) : "";

export async function POST(request: Request) {
  const who = await caller("continents");
  if (isResponse(who)) return who;
  const body = await jsonBody<{ name?: unknown; scopes?: unknown; topicIds?: unknown }>(
    request,
  );
  const name = str(body?.name, 120);
  if (!name) return apiError("invalid", { requestId: who.requestId, reason: "name" });
  const scopes: ScopeOffer[] = (Array.isArray(body?.scopes) ? body.scopes : [])
    .slice(0, 6)
    .map((s: { label?: unknown; note?: unknown }) => ({
      label: str(s?.label, 120),
      note: str(s?.note, 400),
    }))
    .filter((s) => s.label);
  const topicIds = (Array.isArray(body?.topicIds) ? body.topicIds : [])
    .filter((id): id is string => typeof id === "string")
    .slice(0, 40);
  try {
    // RLS would make an UPDATE on a foreign topic a silent no-op; say so instead.
    for (const id of topicIds)
      if (!(await ownsTopic(who.db, id)))
        return apiError("notfound", { requestId: who.requestId });
    const continent = await createContinent(who.db, who.userId, {
      name,
      scopes,
      topicIds,
    });
    return withRequestId(NextResponse.json(continent, { status: 201 }), who.requestId);
  } catch (err) {
    logError("continent_create_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
