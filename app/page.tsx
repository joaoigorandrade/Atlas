import { redirect } from "next/navigation";
import AtlasApp from "@/components/AtlasApp";
import { loadRunCore, type LoadedRun } from "@/lib/persistence";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");

  // The map's first paint used to wait on a browser→Supabase round-trip for
  // this row (~770 ms measured). It is small by design — the content caches
  // live in their own column — so reading it here, on the server that is
  // already talking to Supabase for the session, hands the client an
  // already-drawable map instead of a spinner.
  //
  // Best-effort: a failure here falls through to the client's own load rather
  // than 500ing a page that works fine without it.
  let initialRun: LoadedRun | null = null;
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
