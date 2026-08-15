import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { logWarning } from "@/lib/log";
import { createClient } from "@/lib/supabase/server";

/** Magic-link landing: verify the emailed token, set the session, enter the app. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  // Every failure used to collapse into `?error=link`, which tells a learner
  // whose link was fine but whose network wasn't that their link expired.
  // The two cases are different sentences, so they travel as different reasons.
  if (!tokenHash || !type)
    return NextResponse.redirect(new URL("/login?error=link", request.url));

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  });
  if (!error) return NextResponse.redirect(new URL("/", request.url));

  logWarning("confirm_failed", error, { type });
  // `expired` covers the genuinely spent link; anything else is a service that
  // couldn't verify it right now and is worth another try.
  const reason = /expired|invalid|not found/i.test(error.message)
    ? "expired"
    : "unavailable";
  return NextResponse.redirect(new URL(`/login?error=${reason}`, request.url));
}
