// Account + data deletion (#33, privacy). Auth-gated:
//   1. Delete the caller's run_states rows via RLS (their learning data).
//   2. Delete the auth user via the service key — its FK cascade purges BOTH
//      run_states and generation_log. generation_log has no user-facing delete
//      policy on purpose (its rows are spend telemetry, not the user's data to
//      rewrite), so the cascade is the only correct way to remove those rows.
// Returns 200 even if the auth-user delete is skipped (no service key) — the
// personal run data is already gone; the non-personal audit rows remain.

import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { logError, logEvent } from "@/lib/log";
import {
  apiError,
  newRequestId,
  withRequestId,
} from "@/lib/server/apiError";
import { createClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/config";

export async function POST() {
  const requestId = newRequestId();

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError) {
    logError("auth_unavailable", authError, { req: requestId, at: "delete" });
    return apiError("upstream", { requestId, status: 503 });
  }
  const userId = claims?.claims?.sub;
  if (!userId) return apiError("auth", { requestId });

  // RLS confines this to the caller's own rows.
  const runs = await supabase.from("run_states").delete().eq("user_id", userId);
  // PostgREST's own prose used to go straight onto the wire from here. It is a
  // database's account of a database's problem — it says nothing a learner can
  // act on, and it says more than they should see.
  if (runs.error) {
    logError("account_delete_rows_failed", runs.error, { req: requestId });
    return apiError("unknown", { requestId });
  }

  // Delete the auth user too when the server secret is available; otherwise the
  // data is gone but the login shell remains (degraded, but not a data leak).
  const secret = process.env.SUPABASE_SECRET_KEY;
  let authDeleted = false;
  if (secret) {
    const admin = createAdminClient(supabaseUrl(), secret, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) logError("account_delete_auth_failed", error, { req: requestId });
    else authDeleted = true;
  }

  await supabase.auth.signOut();
  logEvent("account_deleted", { user: userId, authDeleted, req: requestId });
  return withRequestId(
    NextResponse.json({ ok: true, authDeleted }),
    requestId,
  );
}
