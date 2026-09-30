"use client";

// Device-level voice preferences: whether this learner wants to dictate and to
// be read to, wherever the browser can do either. Split from `lib/speech.ts`
// because it changes for a different reason than the engines do.

import { useCallback, useEffect, useState } from "react";

export const VOICE_STORAGE_KEY = "atlas.voice";

export interface VoicePrefs {
  dictation: boolean;
  readAloud: boolean;
}

/** Both halves are on wherever the browser can do them. */
export const DEFAULT_VOICE_PREFS: VoicePrefs = {
  dictation: true,
  readAloud: true,
};

/** Tolerates a missing, malformed, or half-written value — a corrupt entry
 *  falls back to the defaults rather than taking voice away. */
export function parseVoicePrefs(raw: string | null): VoicePrefs {
  if (!raw) return DEFAULT_VOICE_PREFS;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_VOICE_PREFS;
  }
  if (!parsed || typeof parsed !== "object") return DEFAULT_VOICE_PREFS;
  const rec = parsed as Record<string, unknown>;
  return {
    dictation:
      typeof rec.dictation === "boolean" ? rec.dictation : DEFAULT_VOICE_PREFS.dictation,
    readAloud:
      typeof rec.readAloud === "boolean" ? rec.readAloud : DEFAULT_VOICE_PREFS.readAloud,
  };
}

// One device-level store shared by every hook instance, so flipping a toggle
// in Settings reaches a mic mounted on another surface.
let storedPrefs: VoicePrefs = DEFAULT_VOICE_PREFS;
let prefsLoaded = false;
const prefsListeners = new Set<(p: VoicePrefs) => void>();

/** Device-level voice preferences. Mirrors `detectLanguage()` in `lib/i18n`:
 *  mount with the defaults, read `localStorage` in an effect, so the server
 *  render and the first client render agree. */
export function useVoicePrefs(): VoicePrefs & {
  setDictation: (on: boolean) => void;
  setReadAloud: (on: boolean) => void;
} {
  const [prefs, setPrefs] = useState<VoicePrefs>(DEFAULT_VOICE_PREFS);

  useEffect(() => {
    if (!prefsLoaded) {
      prefsLoaded = true;
      storedPrefs = parseVoicePrefs(window.localStorage.getItem(VOICE_STORAGE_KEY));
    }
    setPrefs(storedPrefs);
    prefsListeners.add(setPrefs);
    return () => {
      prefsListeners.delete(setPrefs);
    };
  }, []);

  const patch = useCallback((next: Partial<VoicePrefs>) => {
    storedPrefs = { ...storedPrefs, ...next };
    window.localStorage.setItem(VOICE_STORAGE_KEY, JSON.stringify(storedPrefs));
    for (const listen of prefsListeners) listen(storedPrefs);
  }, []);

  return {
    ...prefs,
    setDictation: useCallback((on: boolean) => patch({ dictation: on }), [patch]),
    setReadAloud: useCallback((on: boolean) => patch({ readAloud: on }), [patch]),
  };
}

