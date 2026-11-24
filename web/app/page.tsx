import { redirect } from "next/navigation";
import AtlasApp from "@/components/AtlasApp";
import AuthUnavailable from "@/components/AuthUnavailable";
import { FIXTURES } from "@/lib/fixtureMode";
import { logWarning } from "@/lib/log";
import { FIXTURE_EMAIL } from "@/lib/server/fixtures";
import type { Profile, Topic } from "@/lib/persistence";
import { getProfile, loadLibrary } from "@/lib/server/store";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  // Couldn't ask ≠ answered no. Sending a signed-in learner to /login because
  // Supabase blinked is worse than showing them a retry.
  if (error) {
    logWarning("auth_unavailable", error, { at: "home" });
    return <AuthUnavailable />;
  }
  if (!data?.claims) redirect("/login");

  // The map's first paint used to wait on a browser→Supabase round-trip
  // (~770 ms measured). The same query runs here instead, on the server that is
  // already talking to Supabase for the session, so the client is handed an
  // already-drawable map rather than a spinner. Generated content is not in it
  // — that arrives behind the drawn map.
  //
  // Best-effort: a failure falls through to the client's own bootstrap rather
  // than 500ing a page that works fine without it.
  //
  // Skipped in fixture mode: the tables live in the test process's memory, and
  // `initial` is left off entirely rather than passed as null — null means "the
  // server looked and there is nothing", and the client takes it at its word.
  // `undefined` when the query fails, never null: null tells the client "this
  // learner has no maps" and opens map creation over a library that exists.
  let initial: { profile: Profile; topics: Topic[] } | undefined;
  if (FIXTURES) return <AtlasApp user={{ email: FIXTURE_EMAIL }} />;
  try {
    const [profile, topics] = await Promise.all([
      getProfile(supabase as never, data.claims.sub as string),
      loadLibrary(supabase as never),
    ]);
    initial = { profile, topics };
  } catch (err) {
    console.warn("server-side bootstrap failed", err);
  }

  return <AtlasApp user={accountOf(data.claims)} initial={initial} />;
}

/** The account as the app greets it: the email, and the name the identity
 *  provider put in `user_metadata` (Google's `full_name`), when there is one. */
function accountOf(claims: Record<string, unknown>): { email: string; name?: string } {
  const meta = (claims.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
  const name = [meta.full_name, meta.name].find((n) => typeof n === "string" && n.trim());
  return {
    email: (claims.email as string | undefined) ?? "",
    ...(name ? { name: name as string } : {}),
  };
}
