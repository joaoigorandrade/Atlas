// The batch warm. The client posts the same request bodies it would send to
// /api/generate; this route answers only from `content_cache` and never calls
// a model, so it is cheap enough to fire on every map open.
//
// One round-trip fills the whole neighbourhood the learner is about to walk
// through — every phase of theirs (or anyone's) that has been generated before
// opens with no overlay at all. Misses come back as misses; the warm queue
// then generates them in the background, ahead of the click.

import { NextResponse } from "next/server";
import { readManyContent } from "@/lib/server/contentCache";
import { BadRequest, resolveJob, type GenerateBody } from "@/lib/server/job";
import { createClient } from "@/lib/supabase/server";

/** A pure cache read — bounded so one request can't sweep the table. */
const MAX_ITEMS = 24;

interface ContentBody {
  items?: GenerateBody[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub)
    return NextResponse.json({ error: "sign in first" }, { status: 401 });

  let body: ContentBody;
  try {
    body = (await request.json()) as ContentBody;
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }

  const items = Array.isArray(body.items) ? body.items.slice(0, MAX_ITEMS) : [];
  // Map each item to its cache key, dropping anything malformed or uncacheable
  // rather than failing the batch — a warm is best-effort by nature.
  const keyed = items.map((item, index) => {
    try {
      const job = resolveJob(item);
      return job.key ? { index, key: job.key } : null;
    } catch (err) {
      if (err instanceof BadRequest) return null;
      throw err;
    }
  });

  const keys = [...new Set(keyed.filter((k) => k !== null).map((k) => k!.key))];
  const found = await readManyContent(keys);

  // Answer positionally: the client posted an ordered list and knows which
  // index is which screen.
  const hits: Record<number, unknown> = {};
  for (const entry of keyed) {
    if (!entry) continue;
    const payload = found[entry.key];
    if (payload !== undefined) hits[entry.index] = payload;
  }
  return NextResponse.json({ hits });
}
