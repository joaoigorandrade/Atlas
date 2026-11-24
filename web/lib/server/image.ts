// Image generation for visual worked examples, through the same OpenRouter
// account as every text call (see ./openrouter.ts for the key and base URL).
//
// Env:
//   OPENROUTER_IMAGE_MODEL — image model slug, or "off" to disable images

import {
  apiKey,
  authHeaders,
  BASE_URL,
  OpenRouterError,
  providerError,
  REQUEST_MS,
} from "@/lib/server/openrouter";

/** The image model, or null when switched off (`OPENROUTER_IMAGE_MODEL=off`). */
export function imageModel(): string | null {
  const m = process.env.OPENROUTER_IMAGE_MODEL || "microsoft/mai-image-2.7-flash";
  return m === "off" ? null : m;
}

/** The house style every example image is drawn in — appended, never left to
 *  the content model, so a pass can't talk the picture into a poster. */
const IMAGE_STYLE =
  "Style: clean textbook schematic, black ink lines on a plain white background, flat, no shading, no decorative text, no title; only the short labels named above.";

/**
 * One image, one call. Deliberately no retry and no fallback model: every
 * attempt is billed, and a missing picture costs the learner nothing — the
 * worked steps stand on their own. The caller caches what comes back.
 */
export async function generateImage(
  prompt: string,
): Promise<{ bytes: Buffer; mime: string }> {
  const model = imageModel();
  if (!model) throw new OpenRouterError("image generation is off", 404);
  const started = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: authHeaders(apiKey()),
    signal: AbortSignal.timeout(REQUEST_MS),
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: `${prompt}\n\n${IMAGE_STYLE}` }],
      // Image-only model: asking for "text" too routes to no endpoint.
      modalities: ["image"],
      image_config: { aspect_ratio: "4:3" },
    }),
  });
  if (!res.ok) throw await providerError(res);
  const data = (await res.json()) as {
    choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
    usage?: { cost?: number };
  };
  const url = data.choices?.[0]?.message?.images?.[0]?.image_url?.url ?? "";
  const m = /^data:([^;]+);base64,(.+)$/.exec(url);
  if (!m) throw new OpenRouterError("OpenRouter returned no image", 502);
  console.log(
    JSON.stringify({ evt: "generate", kind: "image", model, ms: Date.now() - started, cost: data.usage?.cost ?? null }),
  );
  return { mime: m[1], bytes: Buffer.from(m[2], "base64") };
}
