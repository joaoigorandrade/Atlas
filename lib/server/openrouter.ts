// Server-side OpenRouter client. The key never leaves the server: routes in
// app/api call this, the browser only ever talks to our own API.
//
// Env:
//   OPENROUTER_API_KEY        — required
//   OPENROUTER_MODEL          — content model slug (default below)
//   OPENROUTER_JUDGE_MODEL    — stronger model for answer judging (defaults to OPENROUTER_MODEL)
//   OPENROUTER_FALLBACK_MODEL — comma-separated chain tried after retries exhaust (#11)
//   OPENROUTER_BASE_URL       — override for tests/self-hosted gateways

/** Cheap default that reliably produces the structured JSON this app needs.
 *  `deepseek/deepseek-chat` is OpenRouter's alias for DeepSeek's latest V3
 *  flagship chat model — cheap and strong at structured JSON. */
export const DEFAULT_MODEL = "deepseek/deepseek-chat";

const BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

/**
 * Nothing may run unbounded. Two separate bounds, because the two failures
 * they catch are different animals:
 *
 * - `REQUEST_MS` caps a whole call. A model that streams forever (one probe
 *   returned 1.9 MB of SSE for a "~600 words" prompt) dies here.
 * - `FIRST_TOKEN_MS` caps the silence *before* the first token, and only a
 *   stream can enforce it. A misconfigured model sat mute for 12m45s and then
 *   streamed a perfectly valid answer — a whole-request cap would have waited
 *   out the silence, and the learner would have too.
 *
 * Both are well inside the route's `maxDuration`, so a timeout surfaces as our
 * own error rather than a platform-level 504.
 */
const REQUEST_MS = Number(process.env.OPENROUTER_TIMEOUT_MS || 90_000);
const FIRST_TOKEN_MS = Number(process.env.OPENROUTER_FIRST_TOKEN_MS || 25_000);

/** Output cap for judge calls — a verdict plus a few sentences, never prose.
 *  Content generations stay uncapped: they legitimately run to thousands of
 *  tokens, and truncating one mid-JSON just fails validation. `REQUEST_MS` is
 *  what bounds those. */
const JUDGE_MAX_TOKENS = Number(process.env.OPENROUTER_JUDGE_MAX_TOKENS || 1200);

/** User-facing copy for transient upstream failures — never raw provider JSON. */
const BUSY_MESSAGE = "The writer is busy — try again in a moment.";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/** Which model role a call wants: bulk content, or the stricter judge (#28). */
export type ModelRole = "content" | "judge";

class OpenRouterError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function modelChain(role: ModelRole): string[] {
  const primary =
    role === "judge"
      ? process.env.OPENROUTER_JUDGE_MODEL ||
        process.env.OPENROUTER_MODEL ||
        DEFAULT_MODEL
      : process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
  const fallbacks = (process.env.OPENROUTER_FALLBACK_MODEL ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [primary, ...fallbacks.filter((m) => m !== primary)];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ChatResult {
  content: string;
  model: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** One POST to one model. Throws OpenRouterError with the raw body attached. */
async function chatOnce(
  model: string,
  messages: ChatMessage[],
  key: string,
  maxTokens?: number,
): Promise<ChatResult> {
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      // Optional OpenRouter attribution headers.
      "HTTP-Referer": "https://atlas.local",
      "X-Title": "Atlas Learning Platform",
    },
    signal: AbortSignal.timeout(REQUEST_MS),
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
      ...(maxTokens ? { max_tokens: maxTokens } : null),
      // Most cheap models honor this; models that don't still get the
      // "JSON only" instruction in the system prompt.
      response_format: { type: "json_object" },
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new OpenRouterError(`OpenRouter ${res.status}: ${body.slice(0, 600)}`, res.status);
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new OpenRouterError("OpenRouter returned an empty completion", 502);
  return { content, model, usage: data.usage };
}

/** Delays before retrying a transient failure on the same model (#11). */
const RETRY_DELAYS_MS = [1000, 4000];

/**
 * Chat with retry + fallback: each model in the chain gets its transient
 * failures (429/5xx/network) retried with backoff before the next model is
 * tried. 401/402 surface immediately and distinctly — the operator must see
 * key/billing problems. Everything else maps to friendly copy for the client
 * while the raw provider payload is logged server-side.
 */
async function chat(messages: ChatMessage[], role: ModelRole): Promise<ChatResult> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key)
    throw new OpenRouterError("OPENROUTER_API_KEY is not set — add it to .env.local", 500);
  let last: unknown;
  for (const model of modelChain(role)) {
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        return await chatOnce(
          model,
          messages,
          key,
          role === "judge" ? JUDGE_MAX_TOKENS : undefined,
        );
      } catch (err) {
        const status = err instanceof OpenRouterError ? err.status : 0;
        // Key/billing problems: no retry, no fallback, no friendly mask.
        if (status === 401 || status === 402)
          throw new OpenRouterError(
            `OpenRouter key/billing problem (${status}) — check OPENROUTER_API_KEY and credit`,
            status,
          );
        last = err;
        console.error(
          JSON.stringify({
            evt: "openrouter_retry",
            model,
            attempt,
            status,
            error: String(err instanceof Error ? err.message : err).slice(0, 600),
          }),
        );
        if (attempt < RETRY_DELAYS_MS.length) await sleep(RETRY_DELAYS_MS[attempt]);
      }
    }
  }
  console.error(
    JSON.stringify({
      evt: "openrouter_exhausted",
      role,
      error: String(last instanceof Error ? last.message : last).slice(0, 600),
    }),
  );
  throw new OpenRouterError(BUSY_MESSAGE, 502);
}

/** Pull the first JSON object out of a completion (fences and prose tolerated). */
function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const unfenced = trimmed.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const start = unfenced.indexOf("{");
  const end = unfenced.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object found");
  return JSON.parse(unfenced.slice(start, end + 1));
}

/**
 * Ask the model for JSON and validate it. On a parse/validation failure the
 * prompt is retried once with the error appended, then the error surfaces to
 * the route (the client toasts it). Every call emits one structured log line
 * (#19): label, model, validation attempts, latency, token usage, outcome.
 */
export async function generateJson<T>(
  messages: ChatMessage[],
  validate: (raw: unknown) => T,
  opts: { label?: string; role?: ModelRole } = {},
): Promise<T> {
  const { label = "unlabeled", role = "content" } = opts;
  const started = Date.now();
  let lastError: unknown;
  let lastResult: ChatResult | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const withFeedback: ChatMessage[] =
      attempt === 0
        ? messages
        : [
            ...messages,
            {
              role: "user",
              content: `Your previous reply failed validation: ${String(
                lastError instanceof Error ? lastError.message : lastError,
              )}. Reply again with ONLY the corrected JSON object.`,
            },
          ];
    let text: ChatResult;
    try {
      text = await chat(withFeedback, role);
    } catch (err) {
      logGeneration(label, lastResult, attempt, started, "upstream-error");
      throw err;
    }
    lastResult = text;
    try {
      const value = validate(extractJson(text.content));
      logGeneration(label, text, attempt + 1, started, "ok");
      return value;
    } catch (err) {
      lastError = err;
    }
  }
  logGeneration(label, lastResult, 2, started, "validation-fail");
  throw new OpenRouterError(
    `The model's JSON failed validation twice: ${String(
      lastError instanceof Error ? lastError.message : lastError,
    )}`,
    502,
  );
}

/** One POST to one model, streamed. Yields raw text deltas as they arrive —
 *  no retry, no fallback chain (a caller that wants those falls back to
 *  `generateJson` wholesale on failure, since a half-streamed response can't
 *  be cleanly retried in place).
 *
 *  `onFirstToken` fires once, when the first delta lands: for a streamed call
 *  that is the number that matters (when the learner sees something), and it
 *  is invisible in the total latency `logGeneration` records. */
async function* chatStreamOnce(
  model: string,
  messages: ChatMessage[],
  key: string,
  onFirstToken?: () => void,
  maxTokens?: number,
): AsyncGenerator<string> {
  // Two deadlines on one controller: the silence before the first token, and
  // the call as a whole. Whichever fires first aborts the fetch, and the
  // reader's read() rejects — so a mute model can never hold a learner.
  const abort = new AbortController();
  let timedOut: "first token" | "total" | null = null;
  const bomb = (why: "first token" | "total", ms: number) =>
    setTimeout(() => {
      timedOut ??= why;
      abort.abort();
    }, ms);
  let firstTokenTimer: ReturnType<typeof setTimeout> | null = bomb("first token", FIRST_TOKEN_MS);
  const totalTimer = bomb("total", REQUEST_MS);
  const disarm = () => {
    if (firstTokenTimer) clearTimeout(firstTokenTimer);
    firstTokenTimer = null;
  };
  const failed = (err: unknown): never => {
    if (!timedOut) throw err;
    throw new OpenRouterError(
      `OpenRouter ${model} exceeded the ${timedOut} timeout`,
      504,
    );
  };

  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://atlas.local",
        "X-Title": "Atlas Learning Platform",
      },
      signal: abort.signal,
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.6,
        ...(maxTokens ? { max_tokens: maxTokens } : null),
        stream: true,
      }),
    }).catch(failed);
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new OpenRouterError(
        `OpenRouter ${res.status}: ${body.slice(0, 600)}`,
        res.status,
      );
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    while (true) {
      const { done, value } = await reader.read().catch(failed);
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let delta: string | undefined;
        try {
          const evt = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          delta = evt.choices?.[0]?.delta?.content;
        } catch {
          // A malformed SSE frame (rare keep-alive/comment) — skip it.
          continue;
        }
        if (!delta) continue;
        // The first token disarms the silence deadline; the total one runs on.
        disarm();
        onFirstToken?.();
        onFirstToken = undefined;
        yield delta;
      }
    }
  } finally {
    disarm();
    clearTimeout(totalTimer);
  }
}

/** Pull complete top-level `{...}` objects out of a growing buffer, tolerant
 *  of whitespace/newlines/commas between them and of braces inside string
 *  literals. Returns what's left over (an in-progress object, or nothing). */
export function extractCompleteObjects(buf: string): { objects: string[]; rest: string } {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  let lastEnd = 0;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(buf.slice(start, i + 1));
        lastEnd = i + 1;
        start = -1;
      }
    }
  }
  return { objects, rest: buf.slice(lastEnd) };
}

/**
 * Stream a completion expected to contain a sequence of top-level JSON
 * objects (not one wrapping object/array) and yield each as it completes,
 * validated. No corrective retry here — unlike `generateJson`, a caller that
 * hits a validation error mid-stream can't cleanly redo just the bad part;
 * the caller's job is to fall back to the single-shot, retried path.
 */
export async function* streamJsonObjects<T>(
  messages: ChatMessage[],
  validate: (raw: unknown, index: number) => T,
  opts: { label?: string; role?: ModelRole; maxTokens?: number } = {},
): AsyncGenerator<T> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key)
    throw new OpenRouterError("OPENROUTER_API_KEY is not set — add it to .env.local", 500);
  const { label = "unlabeled", role = "content", maxTokens } = opts;
  const model = modelChain(role)[0];
  const started = Date.now();
  let firstTokenMs: number | null = null;
  let buf = "";
  let index = 0;
  // `finally` rather than `catch`, so exactly one line is emitted however the
  // stream ends — cleanly, on a throw, or because the consumer walked away
  // mid-iteration (which calls the generator's `return`).
  let outcome: StreamOutcome = "abandoned";
  try {
    for await (const delta of chatStreamOnce(
      model,
      messages,
      key,
      () => {
        firstTokenMs = Date.now() - started;
      },
      maxTokens,
    )) {
      buf += delta;
      const { objects, rest } = extractCompleteObjects(buf);
      buf = rest;
      for (const raw of objects) yield validate(JSON.parse(raw), index++);
    }
    // A stream that ends cleanly having produced nothing is a failure, not an
    // empty answer — an empty completion is exactly what a model returns when
    // it refuses the prompt shape. Throwing here is what routes it into every
    // caller's `catch`, which is where the retried single-shot fallback lives;
    // without it the route saw a clean, empty stream and returned a 502 while
    // the documented safety net never fired.
    if (index === 0)
      throw new OpenRouterError("the model streamed no JSON objects", 502);
    outcome = "ok";
  } catch (err) {
    // The object count in the log line says whether anything usable landed
    // before this; the caller logs the error itself.
    outcome = "stream-fail";
    throw err;
  } finally {
    logStream(label, model, started, firstTokenMs, index, outcome);
  }
}

function logGeneration(
  label: string,
  result: ChatResult | null,
  attempts: number,
  started: number,
  outcome: "ok" | "validation-fail" | "upstream-error",
): void {
  console.log(
    JSON.stringify({
      evt: "generate",
      kind: label,
      model: result?.model ?? null,
      attempts,
      ms: Date.now() - started,
      prompt_tokens: result?.usage?.prompt_tokens ?? null,
      completion_tokens: result?.usage?.completion_tokens ?? null,
      outcome,
    }),
  );
}

type StreamOutcome = "ok" | "stream-fail" | "abandoned";

/**
 * The streamed twin of `logGeneration`. Same `evt: "generate"` shape so both
 * paths aggregate together, plus the two numbers only a stream has: how long
 * until the first token (what the learner actually waits for) and how many
 * objects made it out. A streamed response carries no usage block, so the
 * token counts are null rather than fabricated.
 */
function logStream(
  label: string,
  model: string,
  started: number,
  firstTokenMs: number | null,
  objects: number,
  outcome: StreamOutcome,
): void {
  console.log(
    JSON.stringify({
      evt: "generate",
      kind: label,
      model,
      streamed: true,
      ms: Date.now() - started,
      first_token_ms: firstTokenMs,
      objects,
      prompt_tokens: null,
      completion_tokens: null,
      outcome,
    }),
  );
}

export { OpenRouterError };
