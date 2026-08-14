// The synthesized-audio cache. Same shape and the same service-role posture as
// `lib/server/contentCache.ts`, deliberately in its own table.
//
// It could have been another kind inside `content_cache`, but that table's
// VERSION is bumped whenever a *prompt* changes — and audio for prose that
// didn't change should not be thrown away, and re-billed per character,
// because a Socratic prompt was reworded. The two caches invalidate for
// unrelated reasons, so they get unrelated versions.
//
// The payoff is the content cache's: the prose is already shared across
// learners, so the second person to read a section pays neither the wait nor
// the characters. That is what makes the provider's per-character price
// largely beside the point.
//
// Service-role only: `speech_cache` has RLS on with no policies, so the
// browser's publishable key can't reach it. Without SUPABASE_SECRET_KEY the
// module degrades to "always a miss" — read-aloud still works, it just
// re-synthesizes.

import { createHash } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Language } from "@/lib/i18n";
import { logError, logEvent } from "@/lib/log";
import { supabaseUrl } from "@/lib/supabase/config";
import type { SpeechClip } from "@/lib/server/tts";

/** Bump (or set SPEECH_CACHE_VERSION) to abandon every stored clip — a voice
 *  change, a provider change, or a change to the payload shape. Rows under the
 *  old version simply stop being addressed; nothing needs deleting. */
const VERSION = process.env.SPEECH_CACHE_VERSION || "1";

let cached: SupabaseClient | null | undefined;
let warned = false;

function admin(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!secret) {
    if (!warned) {
      warned = true;
      logEvent("speech_cache_disabled", {
        reason: "SUPABASE_SECRET_KEY is not set — every read re-synthesizes",
      });
    }
    cached = null;
    return null;
  }
  cached = createClient(supabaseUrl(), secret, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return cached;
}

/**
 * The address of one clip: everything that changes the audio, and nothing
 * else. The separator is a NUL byte, as in `contentKey` — it can't occur in a
 * model slug, a voice, a locale or prose, so no two different inputs can
 * collide by running together. Written as an escape rather than a literal,
 * so unlike `contentCache.ts` this file still reads as text to git and grep.
 */
export function speechKey(opts: {
  text: string;
  language: Language;
  voice: string;
  model: string;
}): string {
  const parts = [
    VERSION,
    "speechify",
    opts.model,
    opts.voice,
    opts.language,
    opts.text,
  ];
  return createHash("sha256").update(parts.join("\u0000")).digest("hex");
}

/** The stored clip, or null on a miss / when the cache is unavailable. */
export async function readClip(key: string): Promise<SpeechClip | null> {
  const db = admin();
  if (!db) return null;
  try {
    const { data, error } = await db.rpc("speech_cache_get", { cache_key: key });
    if (error) throw new Error(error.message);
    const clip = data as SpeechClip | null;
    // A row written under an older payload shape would play as silence; check
    // the two fields that matter rather than trusting the read.
    if (!clip || typeof clip.audio !== "string" || !Array.isArray(clip.marks))
      return null;
    return clip;
  } catch (err) {
    // A cache that's down must never break a reading — fall through and pay.
    logError("speech_cache_read_failed", err, { key });
    return null;
  }
}

/** Store a fresh clip. Not awaited: the learner hears it the moment it exists,
 *  and the write settles behind them. */
export function writeClip(key: string, clip: SpeechClip): void {
  const db = admin();
  if (!db) return;
  void db
    .from("speech_cache")
    .upsert({ key, payload: clip }, { onConflict: "key" })
    .then(({ error }) => {
      if (error) logError("speech_cache_write_failed", new Error(error.message));
    });
}
