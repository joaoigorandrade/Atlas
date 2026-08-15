// Server-side speech synthesis. The key never leaves the server: the browser
// posts prose to /api/speech, and only that route talks to the provider.
//
// Engine is the Speechify API. It was picked on budget with integration cost
// counted: Google Cloud and Polly are cheaper per character on paper ($4/M)
// but both need request signing — a crypto dependency and a private key file
// in a repo with seven runtime deps — while Speechify is the cheapest provider
// reachable with a plain bearer token ($6–10/M against Azure's $16 and
// ElevenLabs' $60–100). Its free tier is 50k characters a month as a *hard
// cap*, which is the actual budget risk here: there is no overage to be
// surprised by. It speaks pt-BR — the app's default language, and the one the
// browser's own `speechSynthesis` was worst at — and it returns speech marks
// with every synthesis, so the read-along costs nothing extra.
//
// Env:
//   SPEECHIFY_API_KEY   — required; without it read-aloud is simply not offered
//   SPEECHIFY_VOICE_ID  — voice slug (default below)
//   SPEECHIFY_MODEL     — override the per-language model choice
//   SPEECHIFY_BASE_URL  — override for tests

import { AtlasError, codeForStatus } from "@/lib/errors";
import type { Language } from "@/lib/i18n";
import { describe, logEvent, logError } from "@/lib/log";
import { speechLang } from "@/lib/locale";

const BASE_URL = process.env.SPEECHIFY_BASE_URL ?? "https://api.sws.speechify.com";

/** A calm, mid-register voice that carries both locales. */
const DEFAULT_VOICE = "henry";

/** Nothing may run unbounded — well inside the route's `maxDuration`, so a
 *  timeout surfaces as our own error rather than a platform 504. */
const REQUEST_MS = Number(process.env.SPEECHIFY_TIMEOUT_MS || 20_000);

/** One word of the audio: where it is in the text, and when it is said.
 *
 *  `from`/`to` are character offsets into the exact string that was sent —
 *  which is `spokenText()` of the paragraph on screen — so the client can map
 *  a timestamp back onto rendered prose without a second index. `at`/`end` are
 *  milliseconds from the start of the clip. */
export interface SpeechMark {
  from: number;
  to: number;
  at: number;
  end: number;
}

export interface SpeechClip {
  /** base64 mp3. */
  audio: string;
  marks: SpeechMark[];
}

export function ttsConfigured(): boolean {
  return Boolean(process.env.SPEECHIFY_API_KEY);
}

/** Non-English needs the multilingual model; English gets the model tuned for
 *  it. Overridable, because the provider's recommended slug moves faster than
 *  a deploy does. */
export function modelFor(language: Language): string {
  return (
    process.env.SPEECHIFY_MODEL ||
    (language === "en" ? "simba-english" : "simba-multilingual")
  );
}

export function voiceId(): string {
  return process.env.SPEECHIFY_VOICE_ID || DEFAULT_VOICE;
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Flatten the provider's speech marks into this app's shape.
 *
 * Defensive on two axes on purpose. The marks arrive as a nested chunk — one
 * "speech" chunk for the whole input, with the words as its `chunks` — and the
 * casing differs between the provider's TypeScript types (`startTime`) and its
 * REST examples (`start_time`), so both are accepted. Anything missing a
 * timestamp is dropped rather than defaulted: a mark at a made-up time would
 * drag the highlight off the voice, which is worse than no highlight at all.
 */
export function normalizeMarks(raw: unknown): SpeechMark[] {
  const out: SpeechMark[] = [];
  const walk = (node: unknown) => {
    if (Array.isArray(node)) {
      for (const child of node) walk(child);
      return;
    }
    if (!node || typeof node !== "object") return;
    const rec = node as Record<string, unknown>;
    const children = rec.chunks;
    // A chunk with children is a container (the sentence, or the whole input);
    // only its leaves are words, and only words are worth highlighting.
    if (Array.isArray(children) && children.length) {
      walk(children);
      return;
    }
    const at = num(rec.startTime) ?? num(rec.start_time);
    const end = num(rec.endTime) ?? num(rec.end_time);
    const from = num(rec.start);
    const to = num(rec.end);
    if (at === null || end === null || from === null || to === null) return;
    if (to <= from || end < at) return;
    out.push({ from, to, at, end });
  };
  walk(raw);
  return out.sort((a, b) => a.at - b.at);
}

interface SpeechifyResponse {
  audio_data?: unknown;
  speech_marks?: unknown;
  billable_characters_count?: unknown;
}

/**
 * Synthesize one segment. `text` must already be the plain, spoken string —
 * the offsets that come back index into it, and markdown sent here would both
 * be read aloud and shift every offset.
 */
export async function synthesize(
  text: string,
  language: Language,
  requestId?: string,
): Promise<SpeechClip> {
  const key = process.env.SPEECHIFY_API_KEY;
  if (!key)
    throw new AtlasError("upstream", "Missing SPEECHIFY_API_KEY — see .env.example");

  const model = modelFor(language);
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${BASE_URL}/v1/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        voice_id: voiceId(),
        model,
        audio_format: "mp3",
        language: speechLang(language),
      }),
      signal: AbortSignal.timeout(REQUEST_MS),
    });
  } catch (err) {
    // An aborted fetch is a timeout, not a failure of the provider — the
    // distinction drives whether the learner is offered a retry.
    const timedOut = err instanceof Error && err.name === "TimeoutError";
    throw new AtlasError(timedOut ? "timeout" : "upstream", describe(err), {
      cause: err,
    });
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    logError("tts_failed", new Error(body.slice(0, 300)), {
      req: requestId,
      status: res.status,
      model,
    });
    throw new AtlasError(codeForStatus(res.status), `speech failed (${res.status})`, {
      status: res.status,
    });
  }

  const payload = (await res.json().catch(() => null)) as SpeechifyResponse | null;
  const audio = payload?.audio_data;
  if (typeof audio !== "string" || !audio)
    throw new AtlasError("upstream", "speech returned no audio");

  const marks = normalizeMarks(payload?.speech_marks);
  // Billed characters are the spend line for this feature, the way
  // `generation_log` is for model calls — one log field, no new table.
  logEvent("tts_call", {
    req: requestId,
    model,
    voice: voiceId(),
    lang: speechLang(language),
    chars: num(payload?.billable_characters_count) ?? text.length,
    marks: marks.length,
    ms: Date.now() - started,
  });
  return { audio, marks };
}
