// The topic's generated content: readings, questioning passes, walkthroughs.
//
// This is what the app used to download as one multi-megabyte `caches` column
// and re-upload, merged, after every generation. Now a screen asks for the
// nodes it is about to show, and nothing is ever uploaded — the generate route
// records the content the moment it exists.
//
// Every item leaves here in the shape its screen renders — the array, or the
// object — never the generator's `{chunks: […]}` envelope. That unwrap
// (`renderShape`) happens on the server so neither client has to know a kind's
// envelope, and so a stored item and a live stream deliver the same thing.
//
// A row holds either a `cache_key` (the usual case: the payload already lives
// once, for everyone, in the shared `content_cache`) or an inline `payload`
// (a kind with no stable key, and every row the normalization backfilled).
// Resolving the pointers needs the service role, which is why this is a route
// and not a PostgREST select — but ownership is established first, through the
// caller's own client, so the service role is only ever used to fetch payloads
// the learner has already been shown to own.
//
// Ask with `?nodes=a,b&kinds=consume,socratic` for what a screen needs, or with
// neither for everything the topic has — which is what an offline mirror asks
// once.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import { apiError, apiErrorFrom, withRequestId } from "@/lib/server/apiError";
import { readManyContent } from "@/lib/server/contentCache";
import {
  ownsTopic,
  readContentRows,
  renderShape,
  type ContentAddress,
} from "@/lib/server/store";
import { caller, isResponse } from "@/lib/server/v1";

type Params = { params: Promise<{ id: string }> };

const list = (value: string | null): string[] =>
  (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export async function GET(request: Request, { params }: Params) {
  const who = await caller("content");
  if (isResponse(who)) return who;
  const { id } = await params;
  const url = new URL(request.url);
  const nodes = list(url.searchParams.get("nodes"));
  const kinds = list(url.searchParams.get("kinds"));

  // The cross product of the two lists — `readContentRows` narrows on each
  // separately, so asking for two nodes and two kinds returns up to four rows.
  const addresses: ContentAddress[] =
    nodes.length && kinds.length
      ? nodes.flatMap((nodeId) => kinds.map((kind) => ({ nodeId, kind })))
      : [];

  try {
    if (!(await ownsTopic(who.db, id)))
      return apiError("notfound", { requestId: who.requestId });

    const rows = await readContentRows(who.db, id, addresses);
    const keys = [
      ...new Set(rows.map((r) => r.cacheKey).filter((k): k is string => !!k)),
    ];
    // One RPC for every pointer in the batch, not one per row.
    const payloads = keys.length ? await readManyContent(keys) : {};

    const items = rows
      .map((r) => ({
        nodeId: r.nodeId,
        kind: r.kind,
        variant: r.variant,
        // Unwrapped here and nowhere else: what leaves this route is the shape
        // the screen renders, which is the same shape a client assembles from
        // live stream frames. See `renderShape`.
        payload: renderShape(r.kind, r.cacheKey ? payloads[r.cacheKey] : r.payload),
      }))
      // A pointer whose shared row has been abandoned by a
      // CONTENT_CACHE_VERSION bump is a miss, not an empty pass — dropping it
      // here is what makes the client generate instead of rendering nothing.
      .filter((item) => item.payload !== undefined && item.payload !== null);

    return withRequestId(NextResponse.json({ items }), who.requestId);
  } catch (err) {
    logError("content_read_failed", err, { req: who.requestId });
    return apiErrorFrom(err, { requestId: who.requestId });
  }
}
