// The shared front door for /api/v1.
//
// Every route needs the same four lines — mint a request id, build the caller's
// Supabase client, read the claims, and tell a signed-out learner apart from a
// Supabase outage. That last distinction is the one worth centralizing: a 401
// on an outage sends a perfectly valid session to the login screen, so an auth
// check that *errors* answers 503 and keeps the learner where they are.

import { NextResponse } from "next/server";
import { logError } from "@/lib/log";
import type { SupabaseClient } from "@supabase/supabase-js";
import { apiError, newRequestId } from "@/lib/server/apiError";
import { createClient } from "@/lib/supabase/server";

export interface Caller {
  db: SupabaseClient;
  userId: string;
  requestId: string;
}

/** The caller, or the response to send instead. */
export async function caller(at: string): Promise<Caller | NextResponse> {
  const requestId = newRequestId();
  const db = (await createClient()) as unknown as SupabaseClient;
  const { data: claims, error } = await db.auth.getClaims();
  if (error) {
    logError("auth_unavailable", error, { req: requestId, at });
    return apiError("upstream", { requestId, status: 503 });
  }
  const userId = claims?.claims?.sub;
  if (!userId) return apiError("auth", { requestId });
  return { db, userId, requestId };
}

export const isResponse = (v: Caller | NextResponse): v is NextResponse =>
  v instanceof NextResponse;

/** Parse a JSON body, or null when there isn't a valid one. */
export async function jsonBody<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}
