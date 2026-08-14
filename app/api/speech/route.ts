// Read-aloud synthesis. The browser posts one already-plain segment of prose
// and gets back the audio for it plus per-word timing; the provider key stays
// on this side. Auth-gated like /api/extract, and cached across users like
// every generation is — see `lib/server/speechCache.ts` for why that cache is
// its own table rather than a kind inside `content_cache`.

import { NextResponse } from "next/server";
import type { Language } from "@/lib/i18n";
import { logError, logEvent } from "@/lib/log";
import {
  apiError,
  apiErrorFrom,
  newRequestId,
  withRequestId,
} from "@/lib/server/apiError";
import { readClip, speechKey, writeClip } from "@/lib/server/speechCache";
import { modelFor, synthesize, ttsConfigured, voiceId } from "@/lib/server/tts";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 30;

/** A Consume paragraph runs a few hundred characters; this only stops abuse.
 *  The client splits by segment, so nothing legitimate comes close. */
const MAX_CHARS = 4_000;

function isLanguage(value: unknown): value is Language {
  return value === "en" || value === "pt-BR";
}

export async function POST(request: Request) {
  const requestId = newRequestId();

  const supabase = await createClient();
  const { data: claims, error: authError } = await supabase.auth.getClaims();
  if (authError) {
    logError("auth_unavailable", authError, { req: requestId, at: "speech" });
    return apiError("upstream", { requestId, status: 503 });
  }
  if (!claims?.claims?.sub) return apiError("auth", { requestId });

  // An unconfigured deploy is a server fact, not a learner's mistake. The
  // client already knows read-aloud is off (NEXT_PUBLIC_TTS_ENABLED) and never
  // renders the control, so this only catches a direct call.
  if (!ttsConfigured())
    return apiError("notfound", { requestId, reason: "tts_off" });

  const body = (await request.json().catch(() => null)) as {
    text?: unknown;
    language?: unknown;
  } | null;

  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (!text) return apiError("invalid", { requestId, reason: "no_text" });
  if (text.length > MAX_CHARS)
    return apiError("invalid", { requestId, reason: "text_too_long" });
  const language: Language = isLanguage(body?.language) ? body.language : "pt-BR";

  const key = speechKey({
    text,
    language,
    voice: voiceId(),
    model: modelFor(language),
  });

  try {
    const hit = await readClip(key);
    if (hit) {
      logEvent("speech_cache_hit", { req: requestId, chars: text.length });
      return withRequestId(NextResponse.json(hit), requestId);
    }
    const clip = await synthesize(text, language, requestId);
    // Not awaited: the learner hears it now, the row settles behind them.
    writeClip(key, clip);
    return withRequestId(NextResponse.json(clip), requestId);
  } catch (err) {
    // `apiErrorFrom` keeps the upstream status: a 429 from the provider has to
    // reach the client as back-pressure, not as a generic failure, or the
    // read-aloud button offers a retry that can only fail again.
    logError("speech_failed", err, { req: requestId });
    return apiErrorFrom(err, { requestId });
  }
}
