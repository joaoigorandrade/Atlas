import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { FIXTURES, fixtureSupabase } from "@/lib/server/fixtures";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

/** Server Supabase client for Server Components, Actions, and Route Handlers. */
export async function createClient() {
  // Fixture mode has no Supabase behind it: every route still runs its real
  // auth check, its real quota check and its real logging call — they are just
  // answered by a stand-in signed-in learner (docs/PLAN-QUALITY.md §1.1).
  if (FIXTURES)
    return fixtureSupabase() as unknown as ReturnType<typeof createServerClient>;

  const cookieStore = await cookies();

  return createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Called from a Server Component — safe to ignore, the middleware
          // refreshes sessions and writes cookies for those requests.
        }
      },
    },
  });
}
