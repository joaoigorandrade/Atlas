// The app's one error vocabulary.
//
// Everything that can fail — a fetch, a model call, a Postgres write, a render —
// is normalized into an `AtlasError` carrying a `code`. The code is what every
// surface keys on: `lib/errorCopy.ts` maps it to the sentence the learner reads,
// `retryable` decides whether they get a "Try again", and the server logs it
// beside a request id. A raw upstream string never reaches the screen.
//
// This generalizes the pattern `lib/speech.ts` already proved for dictation:
// codes travel, copy is chosen at the surface, in the surface's language.
//
// Universal by design. `lib/api.ts` imports it in the browser, so nothing here
// may reach into `lib/server/` — the two server-only error classes (`BadRequest`,
// `OpenRouterError`) are mapped in `lib/server/apiError.ts` instead, and this
// module duck-types on `name`/`status` so it can still recognize them when one
// crosses the boundary.

export type ErrorCode =
  /** No network. The one failure that isn't anyone's fault. */
  | "offline"
  /** 401/403 — the session expired or never existed. Recoverable by signing in. */
  | "auth"
  /** 429 — too many calls, upstream is throttling us. */
  | "rate_limit"
  /** 408/504, an aborted fetch — it took too long, not that it failed. */
  | "timeout"
  /** 5xx, OpenRouter down, a model that returned nothing. Retryable. */
  | "upstream"
  /** 400/422 — the input was wrong. Retrying the same thing won't help. */
  | "invalid"
  /** 404. */
  | "notfound"
  /** A background warm the server declined (204). Control flow, not a failure. */
  | "declined"
  | "unknown";

/** Every code, for validating one that arrived over the wire. */
export const ERROR_CODES = [
  "offline",
  "auth",
  "rate_limit",
  "timeout",
  "upstream",
  "invalid",
  "notfound",
  "declined",
  "unknown",
] as const satisfies readonly ErrorCode[];

/** Is this string a code we know? A server can ship a new one before a cached
 *  client learns the word for it, so unknown values fall back rather than
 *  becoming an empty message. */
export function isErrorCode(value: unknown): value is ErrorCode {
  return (
    typeof value === "string" &&
    (ERROR_CODES as readonly string[]).includes(value)
  );
}

/** Codes worth offering a retry for: the same request could plausibly succeed. */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "offline",
  "timeout",
  "rate_limit",
  "upstream",
]);

export interface AtlasErrorOptions {
  /** HTTP status, when the failure came off the wire. */
  status?: number;
  /** `x-atlas-request-id` — ties this to the server log line for the same call. */
  requestId?: string;
  /**
   * A machine-readable sub-case, for the few failures where the code alone is
   * too coarse to say anything useful — an upload is `invalid` whether the file
   * was 40 MB, a scan with no text layer, or a .docx, and those are three
   * different sentences. The client keys copy on it; it is never prose.
   */
  reason?: string;
  cause?: unknown;
}

/**
 * A classified failure. `message` stays technical and is for logs only — the
 * learner reads `ERROR_STRINGS[language][code]` instead.
 */
export class AtlasError extends Error {
  readonly code: ErrorCode;
  readonly status?: number;
  readonly requestId?: string;
  readonly reason?: string;
  /** True when the same call could plausibly succeed on a second attempt. */
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, opts: AtlasErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    // Set explicitly: subclass names don't survive minification otherwise, and
    // `toAtlasError` below duck-types on `name` across the client/server seam.
    this.name = "AtlasError";
    this.code = code;
    this.status = opts.status;
    this.requestId = opts.requestId;
    this.reason = opts.reason;
    this.retryable = RETRYABLE.has(code);
  }
}

/** The HTTP status → code table. The one place a number becomes a meaning. */
export function codeForStatus(status: number): ErrorCode {
  if (status === 401 || status === 403) return "auth";
  if (status === 404) return "notfound";
  if (status === 408 || status === 504) return "timeout";
  if (status === 429) return "rate_limit";
  if (status >= 500) return "upstream";
  if (status >= 400) return "invalid";
  return "unknown";
}

/** True when the browser knows it has no network. Always false server-side —
 *  a server that can't reach OpenRouter is an `upstream` failure, not an
 *  offline one, and only the browser has a learner to tell about it. */
function browserOffline(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    !navigator.onLine
  );
}

/** A rejected `fetch` — the browser's way of saying "that never left". */
function isFetchFailure(err: Error): boolean {
  return (
    err instanceof TypeError &&
    /fetch|network|load failed/i.test(err.message)
  );
}

/**
 * Normalize anything a `catch` can hand you into an `AtlasError`.
 *
 * Order matters: an already-classified error passes through untouched, then the
 * named classes from either side of the client/server boundary, then the shapes
 * the platform throws, and only then the status duck-type.
 */
export function toAtlasError(err: unknown): AtlasError {
  if (err instanceof AtlasError) return err;

  if (err instanceof Error) {
    // Named classes we can't `instanceof` from here: `WarmDeclined` lives in
    // lib/api.ts (which imports *this*), and the two server classes are off
    // limits to client code entirely.
    if (err.name === "WarmDeclined")
      return new AtlasError("declined", err.message, { cause: err });
    if (err.name === "BadRequest")
      return new AtlasError("invalid", err.message, { status: 400, cause: err });
    if (err.name === "AbortError" || err.name === "TimeoutError")
      return new AtlasError("timeout", err.message, { cause: err });
    if (isFetchFailure(err))
      return new AtlasError(
        browserOffline() ? "offline" : "upstream",
        err.message,
        { cause: err },
      );

    const status = (err as { status?: unknown }).status;
    if (typeof status === "number")
      return new AtlasError(codeForStatus(status), err.message, {
        status,
        cause: err,
      });

    return new AtlasError("unknown", err.message, { cause: err });
  }

  // A thrown string, a rejected `null`, a DOMException that isn't an Error —
  // rare, but a catch block has to survive them.
  const message =
    typeof err === "string" && err ? err : "something went wrong";
  return new AtlasError("unknown", message, { cause: err });
}
