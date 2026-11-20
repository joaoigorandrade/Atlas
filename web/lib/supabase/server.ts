import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { FIXTURES, fixtureSupabase } from "@/lib/server/fixtures";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

/** Server Supabase client for Server Components, Actions, and Route Handlers. */
export async function createClient() {
  // Fixture mode has no Supabase behind it: every route still runs its real
  // auth check, its real quota check and its real logging call — they are just
  // answered by a stand-in signed-in learner (docs/PLAN-QUALITY.md §1.1).
  if (FIXTURES)
    return fixtureSupabase() as unknown as ReturnType<typeof createServerClient>;

  // Native clients (ios/) hold a bearer token, not a cookie jar. One branch,
  // no route change: the token authenticates the caller *and* rides along on
  // every PostgREST request so RLS still sees the learner, not the anon role.
  const bearer = (await headers()).get("authorization");
  if (bearer?.startsWith("Bearer ")) return bearerClient(bearer);

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

/** A client authenticated by `Authorization: Bearer <access_token>`. */
function bearerClient(bearer: string) {
  const client = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    global: { headers: { Authorization: bearer } },
    // No cookie jar on this path — the token is the whole session, and
    // `getClaims()` below is handed it directly instead of reading storage.
    cookies: { getAll: () => [], setAll: () => {} },
  });
  const token = bearer.slice("Bearer ".length);
  const getClaims = client.auth.getClaims.bind(client.auth);
  client.auth.getClaims = ((jwt?: string, options?: Parameters<typeof getClaims>[1]) =>
    getClaims(jwt ?? token, options)) as typeof client.auth.getClaims;
  return client;
}
