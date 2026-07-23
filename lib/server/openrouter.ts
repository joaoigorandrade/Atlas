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
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.6,
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
        return await chatOnce(model, messages, key);
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

export { OpenRouterError };
