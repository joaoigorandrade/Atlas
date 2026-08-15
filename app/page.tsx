import { redirect } from "next/navigation";
import AtlasApp from "@/components/AtlasApp";
import AuthUnavailable from "@/components/AuthUnavailable";
import { FIXTURES } from "@/lib/fixtureMode";
import { logWarning } from "@/lib/log";
import { FIXTURE_EMAIL } from "@/lib/server/fixtures";
import { loadRunCore, type LoadedRun } from "@/lib/persistence";
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

  // The map's first paint used to wait on a browser→Supabase round-trip for
  // this row (~770 ms measured). It is small by design — the content caches
  // live in their own column — so reading it here, on the server that is
  // already talking to Supabase for the session, hands the client an
  // already-drawable map instead of a spinner.
  //
  // Best-effort: a failure here falls through to the client's own load rather
  // than 500ing a page that works fine without it.
  //
  // Skipped in fixture mode: the run lives in the seed store, which only the
  // browser can reach. `initialRun` is left off entirely rather than passed as
  // null — null means "the server looked and there is no run", and the client
  // takes it at its word and never loads.
  let initialRun: LoadedRun | null = null;
  if (FIXTURES) return <AtlasApp userEmail={FIXTURE_EMAIL} />;
  try {
    initialRun = await loadRunCore(supabase);
  } catch (err) {
    console.warn("server-side run load failed", err);
  }

  return (
    <AtlasApp
      userEmail={(data.claims.email as string | undefined) ?? ""}
      initialRun={initialRun}
    />
  );
}
