// Phase 3 — the target an uptime check points at.
//
// One dependency is worth probing: Supabase. OpenRouter is deliberately not
// probed — a probe there costs a model call, and the app already degrades
// visibly (and logs `generate_failed`) when it is down. Everything else is
// this process, which answered if you are reading this at all.
//
// Public on purpose: an uptime checker has no session, and the response says
// nothing a stranger can use — a boolean and a millisecond count, never the
// database's own account of what went wrong (that goes to the log).

import { NextResponse } from "next/server";
import { logWarning } from "@/lib/log";
import { newRequestId } from "@/lib/server/apiError";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const maxDuration = 10;

export async function GET() {
  const requestId = newRequestId();
  const started = Date.now();

  // A real round trip that needs no session: RLS answers an anonymous select
  // with zero rows and no error, so an `error` here means unreachable or
  // misconfigured, which is exactly what this route exists to notice.
  let ok = true;
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("run_states").select("user_id").limit(1);
    if (error) throw new Error(error.message);
  } catch (err) {
    ok = false;
    logWarning("health_supabase_down", err, { req: requestId });
  }

  return NextResponse.json(
    { ok, supabase: ok ? "up" : "down", ms: Date.now() - started },
    { status: ok ? 200 : 503, headers: { "cache-control": "no-store" } },
  );
}
