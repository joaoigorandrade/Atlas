// The one error envelope every route answers with.
//
// Before this the six handlers each invented their own: a bare `{ error }` with
// whatever string was nearest, sometimes raw PostgREST prose straight onto the
// wire. Now every failure is `{ error, code, reason?, requestId }` and every
// response — success included — carries `x-atlas-request-id`, which is the
// whole traceability story: a learner reporting "it failed" can be matched to
// the exact server line without a telemetry vendor or a new table.
//
// `error` stays a human-readable English string so anything reading the old
// shape keeps working, but it is for logs and debugging. The *learner* reads
// copy chosen from `code` in their own language (lib/errorCopy.ts) — upstream
// prose never reaches a screen.
//
// Deliberately free of `lib/server/job` and `lib/server/openrouter` imports:
// two of the routes that need this (account deletion, the reminders cron) have
// nothing to do with generation, and importing those would drag the whole
// prompt tree into their bundles. `toAtlasError` already recognizes both
// classes structurally.

import { NextResponse } from "next/server";
import { toAtlasError, type ErrorCode } from "@/lib/errors";

export const REQUEST_ID_HEADER = "x-atlas-request-id";

/** Short, greppable, and cheap enough to mint per request. */
export function newRequestId(): string {
  return crypto.randomUUID().slice(0, 8);
}

/** The safe, generic sentence per code. Never an upstream body. */
const PUBLIC_MESSAGE: Record<ErrorCode, string> = {
  offline: "the network is unavailable",
  auth: "sign in to continue",
  rate_limit: "too many requests — try again shortly",
  timeout: "the request timed out",
  upstream: "content generation failed",
  invalid: "that request was not valid",
  notfound: "not found",
  declined: "declined",
  unknown: "something went wrong",
};

/** The status a code answers with when the failure didn't come off the wire. */
const DEFAULT_STATUS: Record<ErrorCode, number> = {
  offline: 503,
  auth: 401,
  rate_limit: 429,
  timeout: 504,
  upstream: 502,
  invalid: 400,
  notfound: 404,
  declined: 204,
  unknown: 500,
};

export interface ApiErrorBody {
  /** Generic English. For logs and legacy readers, not for the learner. */
  error: string;
  code: ErrorCode;
  /** A sub-case the client keys copy on — see `AtlasError.reason`. */
  reason?: string;
  requestId: string;
}

export interface ApiErrorOpts {
  requestId?: string;
  reason?: string;
  /** Override the code's default status (a `notfound` served as 200-with-null). */
  status?: number;
  /** Extra headers to preserve — a route that already sets `x-atlas-cache`. */
  headers?: Record<string, string>;
}

/** Build the error response for a known code. */
export function apiError(
  code: ErrorCode,
  opts: ApiErrorOpts = {},
): NextResponse<ApiErrorBody> {
  const requestId = opts.requestId ?? newRequestId();
  const body: ApiErrorBody = {
    error: PUBLIC_MESSAGE[code],
    code,
    requestId,
  };
  if (opts.reason) body.reason = opts.reason;
  return NextResponse.json(body, {
    status: opts.status ?? DEFAULT_STATUS[code],
    headers: { ...opts.headers, [REQUEST_ID_HEADER]: requestId },
  });
}

/**
 * Classify a caught error and answer with it. The status follows the error's
 * own when it carried one (an `OpenRouterError` 429 stays a 429), so upstream
 * back-pressure still reaches the client as back-pressure.
 */
export function apiErrorFrom(
  err: unknown,
  opts: ApiErrorOpts = {},
): NextResponse<ApiErrorBody> {
  const atlas = toAtlasError(err);
  return apiError(atlas.code, {
    ...opts,
    reason: opts.reason ?? atlas.reason,
    status: opts.status ?? atlas.status ?? DEFAULT_STATUS[atlas.code],
  });
}

/** Stamp the request id onto a success response, so a report about content
 *  that arrived *wrong* is as traceable as one about content that failed. */
export function withRequestId<T>(
  response: NextResponse<T>,
  requestId: string,
): NextResponse<T> {
  response.headers.set(REQUEST_ID_HEADER, requestId);
  return response;
}
