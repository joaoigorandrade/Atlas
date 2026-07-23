// Account + data deletion (#33, privacy). Auth-gated:
//   1. Delete the caller's run_states rows via RLS (their learning data).
//   2. Delete the auth user via the service key — its FK cascade purges BOTH
//      run_states and generation_log. generation_log has no user-facing delete
//      policy on purpose (that would let a user reset their #18 quota), so the
//      cascade is the only correct way to remove those audit rows.
// Returns 200 even if the auth-user delete is skipped (no service key) — the
// personal run data is already gone; the non-personal audit rows remain.

import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { supabaseUrl } from "@/lib/supabase/config";

export async function POST() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId)
    return NextResponse.json({ error: "sign in first" }, { status: 401 });

  // RLS confines this to the caller's own rows.
  const runs = await supabase.from("run_states").delete().eq("user_id", userId);
  if (runs.error)
    return NextResponse.json({ error: runs.error.message }, { status: 500 });

  // Delete the auth user too when the server secret is available; otherwise the
  // data is gone but the login shell remains (degraded, but not a data leak).
  const secret = process.env.SUPABASE_SECRET_KEY;
  let authDeleted = false;
  if (secret) {
    const admin = createAdminClient(supabaseUrl(), secret, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error)
      console.error(
        JSON.stringify({ evt: "account_delete_auth_failed", error: error.message }),
      );
    else authDeleted = true;
  }

  await supabase.auth.signOut();
  console.log(JSON.stringify({ evt: "account_deleted", user: userId, authDeleted }));
  return NextResponse.json({ ok: true, authDeleted });
}
