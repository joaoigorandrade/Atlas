import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { supabasePublishableKey, supabaseUrl } from "@/lib/supabase/config";

/**
 * Refreshes the auth session on every matched request and bounces signed-out
 * visitors to /login. Signed-in visitors landing on /login go to the app.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(supabaseUrl(), supabasePublishableKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
        Object.entries(headers).forEach(([key, value]) =>
          supabaseResponse.headers.set(key, value),
        );
      },
    },
  });

  // Do not run code between createServerClient and getClaims() — and never
  // trust getSession() here; getClaims() validates the JWT signature.
  const { data, error } = await supabase.auth.getClaims();
  const user = data?.claims;

  const path = request.nextUrl.pathname;
  const isPublic =
    path.startsWith("/login") || path.startsWith("/auth") || path.startsWith("/privacy");

  // An error here means we could not *ask* whether they are signed in — Supabase
  // was unreachable, or answered 5xx. That is not the same as "signed out", and
  // treating it as one bounces a perfectly valid session to /login, which is the
  // single most alarming thing a transient outage can do to a learner.
  //
  // So a failed check falls through to the page, which gates again on its own
  // (`app/page.tsx` redirects when there are genuinely no claims). Letting the
  // request past a check that never ran costs nothing: the redirect this
  // middleware performs is a convenience, never the access control — RLS and
  // the per-page `getClaims()` are.
  if (error) {
    console.warn(
      JSON.stringify({
        evt: "auth_unavailable",
        at: "middleware",
        path,
        error: String(error.message ?? error).slice(0, 600),
      }),
    );
    return supabaseResponse;
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }
  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Must return supabaseResponse as-is so refreshed cookies reach the browser.
  return supabaseResponse;
}
