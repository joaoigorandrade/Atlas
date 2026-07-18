// Server-side OpenRouter client. The key never leaves the server: routes in
// app/api call this, the browser only ever talks to our own API.
//
// Env:
//   OPENROUTER_API_KEY  — required
//   OPENROUTER_MODEL    — model slug (default: a cheap, structured-output-capable model)
//   OPENROUTER_BASE_URL — override for tests/self-hosted gateways

/** Cheap default that reliably produces the structured JSON this app needs.
 *  `deepseek/deepseek-chat` is OpenRouter's alias for DeepSeek's latest V3
 *  flagship chat model — cheap and strong at structured JSON. */
export const DEFAULT_MODEL = "deepseek/deepseek-chat";

const BASE_URL =
  process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

class OpenRouterError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

async function chat(messages: ChatMessage[]): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key)
    throw new OpenRouterError(
      "OPENROUTER_API_KEY is not set — add it to .env.local",
      500,
    );
  const model = process.env.OPENROUTER_MODEL || DEFAULT_MODEL;
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
    throw new OpenRouterError(
      `OpenRouter ${res.status}: ${body.slice(0, 400)}`,
      res.status === 401 || res.status === 402 ? res.status : 502,
    );
  }
  const data = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content)
    throw new OpenRouterError("OpenRouter returned an empty completion", 502);
  return content;
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
 * the route (the client toasts it).
 */
export async function generateJson<T>(
  messages: ChatMessage[],
  validate: (raw: unknown) => T,
): Promise<T> {
  let lastError: unknown;
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
    const text = await chat(withFeedback);
    try {
      return validate(extractJson(text));
    } catch (err) {
      lastError = err;
    }
  }
  throw new OpenRouterError(
    `The model's JSON failed validation twice: ${String(
      lastError instanceof Error ? lastError.message : lastError,
    )}`,
    502,
  );
}

export { OpenRouterError };
